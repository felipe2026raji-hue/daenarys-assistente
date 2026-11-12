'use strict';

// As chaves de API, guardadas com o seu Windows (DPAPI): "enc:<base64>".
// O resto do app só vê a chave aberta na hora de falar com o provedor; no config.json
// ela nunca fica em texto puro. Sem armazenamento seguro, salvar falha de propósito —
// melhor pedir a chave de novo do que deixá-la à vista de qualquer programa.

const PREFIXO = 'enc:';

// O electron só existe de verdade dentro do app: nos testes (node puro) não há safeStorage.
function cofre() {
  try {
    return require('electron').safeStorage || null;
  } catch {
    return null;
  }
}

function disponivel() {
  const safe = cofre();
  try {
    return Boolean(safe && safe.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function selada(valor) {
  return typeof valor === 'string' && valor.startsWith(PREFIXO);
}

// Fecha a chave. Sem cofre, lança: quem chamou decide o que dizer ao usuário.
function selar(chave) {
  if (!disponivel()) throw new Error('no-safe-storage');
  return `${PREFIXO}${cofre().encryptString(String(chave)).toString('base64')}`;
}

// Abre a chave. Um cofre de outro Windows (config copiado, outro usuário) não abre:
// devolve vazio, e o log conta o motivo sem nunca mostrar o valor.
const avisadas = new Set();

function abrir(guardada) {
  if (typeof guardada !== 'string' || !guardada.startsWith(PREFIXO)) return guardada || '';
  const safe = cofre();
  if (!safe) return '';
  try {
    return safe.decryptString(Buffer.from(guardada.slice(PREFIXO.length), 'base64'));
  } catch {
    if (!avisadas.has(guardada)) {
      avisadas.add(guardada); // uma vez por chave, não a cada mensagem
      try {
        require('./log').aviso('chaves', 'uma chave guardada não abriu neste Windows (config de outro PC?)');
      } catch {
        // o log não pode impedir a leitura da chave
      }
    }
    return '';
  }
}

module.exports = { disponivel, selada, selar, abrir, PREFIXO };
