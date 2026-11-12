'use strict';

// The diary she keeps: every console line and every crash, in
// %APPDATA%/capri-desktop/logs/daenarys.log, so a bug on someone else's PC can be read
// after the fact. Rotates by size (3 files), scrubs API keys before anything lands, and
// "Copy diagnostics" (her menu) puts the useful part on the clipboard.

const fs = require('node:fs');
const path = require('node:path');

const LIMITE = 512 * 1024; // per file
const ARQUIVOS = 3;        // daenarys.log, .1, .2
const LINHA_MAX = 4000;    // a runaway line (a whole HTML page, say) is cut

let pasta = null;
let arquivo = null;
let tamanho = 0;
let pronto = false;
let gravando = false;
let contexto = () => ({});

// Anything that looks like a key is masked: the log travels by chat and by e-mail.
const SEGREDOS = [
  [/\bsk-[A-Za-z0-9_-]{10,}/g, 'sk-…'],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, 'AIza…'],
  [/\bgsk_[A-Za-z0-9_-]{10,}/g, 'gsk_…'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, 'xox…'],
  [/\bhf_[A-Za-z0-9]{10,}/g, 'hf_…'],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{10,}/gi, '$1…'],
  [/((?:api[_-]?key|token|authorization|password|senha)"?\s*[:=]\s*"?)([^"\s,;}]{8,})/gi, '$1…'],
];

function limpar(texto) {
  let saida = String(texto);
  for (const [padrao, troca] of SEGREDOS) saida = saida.replace(padrao, troca);
  return saida;
}

function versao() {
  try {
    return require('../../package.json').version;
  } catch {
    return '?';
  }
}

function umaLinha(valor) {
  if (valor instanceof Error) return `${valor.name}: ${valor.message}${valor.stack ? `\n${valor.stack}` : ''}`;
  if (typeof valor === 'object' && valor !== null) {
    try {
      return JSON.stringify(valor);
    } catch {
      return String(valor);
    }
  }
  return String(valor);
}

function rotacionar() {
  if (tamanho < LIMITE) return;
  try {
    fs.rmSync(`${arquivo}.${ARQUIVOS - 1}`, { force: true });
    for (let i = ARQUIVOS - 2; i >= 1; i--) {
      const de = `${arquivo}.${i}`;
      if (fs.existsSync(de)) fs.renameSync(de, `${arquivo}.${i + 1}`);
    }
    fs.renameSync(arquivo, `${arquivo}.1`);
  } catch {
    // another process may hold it: keep appending, the size check runs again
  }
  tamanho = 0;
}

function gravar(nivel, args) {
  if (!pronto || gravando) return;
  const texto = limpar(args.map(umaLinha).join(' ')).slice(0, LINHA_MAX);
  if (!texto.trim()) return;
  const linha = `${new Date().toISOString()}  ${nivel.padEnd(5)}  ${texto}\n`;
  gravando = true;
  try {
    rotacionar();
    fs.appendFileSync(arquivo, linha, 'utf8');
    tamanho += Buffer.byteLength(linha);
  } catch {
    // a log never closes the app
  } finally {
    gravando = false;
  }
}

// Every console call also lands in the file: nothing in the app has to be changed to be logged.
function escutarConsole() {
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[metodo].bind(console);
    console[metodo] = (...args) => {
      try {
        original(...args);
      } catch {
        // no stdout at all (started from the Explorer): the file still gets it
      }
      gravar(metodo === 'debug' ? 'DEBUG' : metodo.toUpperCase(), args);
    };
  }
}

function iniciar(dir = null) {
  if (pronto) return arquivo;
  try {
    const { app } = require('electron');
    pasta = dir || path.join(app.getPath('userData'), 'logs');
  } catch {
    pasta = dir || path.join(process.cwd(), 'logs');
  }
  try {
    fs.mkdirSync(pasta, { recursive: true });
  } catch {
    return null;
  }
  arquivo = path.join(pasta, 'daenarys.log');
  try {
    tamanho = fs.statSync(arquivo).size;
  } catch {
    tamanho = 0;
  }
  pronto = true;
  escutarConsole();
  process.on('uncaughtException', (err) => gravar('FATAL', ['crash:', err]));
  process.on('unhandledRejection', (err) => gravar('FATAL', ['promise sem tratamento:', err]));
  gravar('INFO', [`Daenarys ${versao()} · electron ${process.versions.electron || '?'} · ${process.platform} ${process.arch}`]);
  return arquivo;
}

const aviso = (area, texto) => gravar('WARN', [`[${area}] ${texto}`]);
const erro = (area, texto) => gravar('ERROR', [`[${area}] ${texto}`]);
const info = (area, texto) => gravar('INFO', [`[${area}] ${texto}`]);

function caminho() {
  return arquivo;
}

function abrirPasta() {
  if (!pronto) iniciar();
  if (!pasta) return { ok: false };
  try {
    fs.mkdirSync(pasta, { recursive: true });
    require('electron').shell.openPath(pasta);
    return { ok: true, path: pasta };
  } catch (err) {
    aviso('logs', `não consegui abrir a pasta: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// The last lines of the current file (and the one before it, when the first is short).
function linhas(quantidade = 40) {
  if (!pronto) iniciar();
  if (!arquivo) return [];
  const ler = (alvo) => {
    try {
      return fs.readFileSync(alvo, 'utf8');
    } catch {
      return '';
    }
  };
  const atual = ler(arquivo).split('\n').filter(Boolean);
  if (atual.length >= quantidade) return atual.slice(-quantidade);
  const antes = ler(`${arquivo}.1`).split('\n').filter(Boolean);
  return [...antes, ...atual].slice(-quantidade);
}

// What "Copy diagnostics" puts on the clipboard: the machine, her settings as they are,
// and the last errors — enough to understand a bug without asking you anything else.
function relatorio() {
  const c = contexto() || {};
  const cabecalho = [];
  cabecalho.push(`Daenarys ${versao()}`);
  cabecalho.push(`electron ${process.versions.electron || '?'} · node ${process.versions.node || '?'} · ${process.platform} ${process.arch} ${process.getSystemVersion?.() || ''}`.trim());
  if (c.idioma) cabecalho.push(`idioma: ${c.idioma}${c.idiomaEscolhido && c.idiomaEscolhido !== c.idioma ? ` (escolha: ${c.idiomaEscolhido})` : ''}`);
  if (c.provedor) cabecalho.push(`provedor: ${c.provedor}${c.modelo ? ` · ${c.modelo}` : ''}`);
  if (c.chaves) cabecalho.push(`chaves guardadas: ${c.chaves}`);
  if (c.motor) cabecalho.push(`motor de voz: ${c.motor}`);
  if (c.atualizacao) cabecalho.push(`atualização: ${c.atualizacao}`);
  if (c.log) cabecalho.push(`log: ${c.log}`);
  const recentes = linhas(60).filter((l) => /\s(ERROR|WARN|FATAL)\s/.test(l)).slice(-15);
  const tudo = recentes.length ? recentes : linhas(15);
  return `${cabecalho.join('\n')}\n\n--- últimas linhas ---\n${tudo.join('\n')}\n`;
}

module.exports = {
  iniciar, caminho, abrirPasta, linhas, relatorio, limpar, versao,
  aviso, erro, info,
  contexto: (fn) => { contexto = typeof fn === 'function' ? fn : () => ({}); },
};
