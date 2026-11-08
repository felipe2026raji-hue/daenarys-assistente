'use strict';

// O motor local (engine/, Python): voz pt-BR e notícias. Roda escondido, só em 127.0.0.1,
// e exige o token gerado aqui. O Electron fala com ele por HTTP.

const { spawn, execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const START_TIMEOUT = 20000;

class Engine {
  constructor() {
    this.child = null;
    this.port = null;
    this.token = crypto.randomBytes(24).toString('hex');
    this.state = 'stopped'; // 'stopped' | 'starting' | 'ready' | 'error'
    this.error = null;
    this.starting = null;
    this.root = null;
    this.mic = ''; // microfone escolhido (nome); vazio = automático
    this.mics = []; // último lista de microfones que o motor entregou
  }

  // O Python do ambiente do motor, ou o do sistema.
  python(engineDir) {
    const candidates = [
      path.join(engineDir, '.venv', 'Scripts', 'python.exe'),
      path.join(engineDir, 'venv', 'Scripts', 'python.exe'),
    ];
    if (process.env.CAPRI_PYTHON) candidates.unshift(process.env.CAPRI_PYTHON);
    for (const file of candidates) {
      if (fs.existsSync(file)) return { command: file, prefix: [] };
    }
    // py launcher: `py -3`
    return { command: 'py.exe', prefix: ['-3'] };
  }

  status() {
    return { state: this.state, port: this.port, error: this.error };
  }

  async start(root = this.root) {
    if (root) this.root = root;
    if (this.state === 'ready') return this.status();
    if (this.starting) return this.starting;

    this.starting = new Promise((resolve) => {
      // num app empacotado o código fica no app.asar; o motor precisa dos arquivos de verdade
      const base = this.root.includes('app.asar')
        ? this.root.replace('app.asar', 'app.asar.unpacked')
        : this.root;
      const engineDir = path.join(base, 'engine');
      const script = path.join(engineDir, 'servidor.py');

      // O motor empacotado (`npm run engine:build`) já traz Python, edge-tts e o
      // portaudio: no app instalado é ele que sobe, sem exigir Python no PC.
      // Em --dev continuam valendo os fontes; CAPRI_ENGINE_EXE=1 testa o .exe.
      const bundled = path.join(engineDir, 'dist', 'servidor', 'servidor.exe');
      const useBundled = (this.root.includes('app.asar') || process.env.CAPRI_ENGINE_EXE === '1')
        && fs.existsSync(bundled);
      if (!useBundled && !fs.existsSync(script)) {
        this.state = 'error';
        this.error = 'motor não encontrado em engine/servidor.py';
        return resolve(this.status());
      }

      this.state = 'starting';
      this.error = null;
      let done = false;
      let buffer = '';
      let timedOut = false;
      let timer = null;

      const finish = (ok, err) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (ok) {
          this.state = 'ready';
          this.error = null;
        } else {
          this.state = 'error';
          this.error = err || 'não consegui iniciar o motor';
        }
        resolve(this.status());
      };

      let child;
      try {
        const args = ['--port', '0', '--token', this.token];
        // o motor também escolhe o microfone pelo ambiente; depois ele muda por POST /microfone
        const env = { ...process.env, CAPRI_MIC: this.mic || '' };
        if (useBundled) {
          child = spawn(bundled, args, {
            cwd: path.dirname(bundled),
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
          });
        } else {
          const { command, prefix } = this.python(engineDir);
          child = spawn(command, [...prefix, script, ...args], {
            cwd: engineDir,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
          });
        }
      } catch (err) {
        return finish(false, `não consegui iniciar o motor (${err.message})`);
      }
      this.child = child;

      timer = setTimeout(() => {
        timedOut = true;
        this.kill();
        finish(false, 'o motor demorou demais para iniciar');
      }, START_TIMEOUT);

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          const match = /^PORTA=(\d+)$/.exec(line);
          if (match) {
            this.port = Number(match[1]);
            finish(true);
          } else if (line) {
            console.log(`[motor] ${line}`);
          }
        }
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        const text = String(chunk).trim();
        if (text) console.error(`[motor] ${text}`);
      });

      child.on('error', (err) => {
        if (!timedOut) finish(false, `não consegui iniciar o Python: ${err.message}`);
      });

      child.on('exit', (code) => {
        if (this.child === child) {
          this.child = null;
          this.port = null;
          if (this.state === 'ready') this.state = 'stopped';
        }
        if (!done) finish(false, `o motor encerrou (código ${code})`);
      });
    }).finally(() => {
      this.starting = null;
    });

    return this.starting;
  }

  async ensure() {
    if (this.state === 'ready') return true;
    if (this.state === 'starting') {
      const s = await this.starting;
      return s.state === 'ready';
    }
    const s = await this.start(this.root);
    return s.state === 'ready';
  }

  request(method, pathname, body, timeout = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.port) return reject(new Error('motor indisponível'));
      const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
      const req = http.request({
        host: '127.0.0.1',
        port: this.port,
        method,
        path: pathname,
        headers: {
          'x-capri-token': this.token,
          ...(payload && { 'content-type': 'application/json', 'content-length': payload.length }),
        },
        timeout,
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve(JSON.parse(text || '{}'));
          } catch (err) {
            reject(new Error(`resposta inválida do motor: ${err.message}`));
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error('o motor não respondeu a tempo')));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async speak(texto) {
    const text = String(texto || '').trim();
    if (!text) return { ok: false, error: 'texto vazio' };
    if (!(await this.ensure())) return { ok: false, error: this.error || 'motor indisponível' };
    try {
      return await this.request('POST', '/falar', { texto: text }, 8000);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async stopSpeaking() {
    if (!(await this.ensure())) return { ok: false };
    try {
      return await this.request('POST', '/parar', {}, 5000);
    } catch {
      return { ok: false };
    }
  }

  // Ela está tocando uma fala agora? (o loop de escuta espera ficar em silêncio)
  async isSpeaking() {
    if (!(await this.ensure())) return false;
    try {
      const res = await this.request('POST', '/falando', {}, 3000);
      return Boolean(res?.falando);
    } catch {
      return false;
    }
  }

  // Cancela uma escuta em andamento (antes de ela falar, para não se ouvir).
  async stopListening() {
    if (!(await this.ensure())) return { ok: false };
    try {
      return await this.request('POST', '/parar-escuta', {}, 3000);
    } catch {
      return { ok: false };
    }
  }

  // Os microfones que ela pode usar (o app mostra nos ajustes, na bandeja e no chat).
  async microphones() {
    if (!(await this.ensure())) {
      return { ok: false, error: this.error || 'motor indisponível', microfones: this.mics };
    }
    try {
      const res = await this.request('GET', '/microfones', undefined, 8000);
      if (Array.isArray(res?.microfones)) this.mics = res.microfones;
      return res;
    } catch (err) {
      return { ok: false, error: err.message, microfones: this.mics };
    }
  }

  // Troca o microfone sem reiniciar o motor. Sem motor de pé, fica guardado para o próximo start.
  async setMic(nome) {
    this.mic = String(nome || '');
    if (this.state !== 'ready') return { ok: true, pending: true, nome: this.mic };
    try {
      const res = await this.request('POST', '/microfone', { nome: this.mic }, 8000);
      if (Array.isArray(res?.microfones)) this.mics = res.microfones;
      return res;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // Bloqueia até você terminar de falar (ou desistir). O timeout acompanha o motor.
  async listen() {
    if (!(await this.ensure())) return { ok: false, error: this.error || 'motor indisponível' };
    try {
      return await this.request('POST', '/ouvir', {}, 40000);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async news({ assunto = null, quantidade = 5 } = {}) {
    if (!(await this.ensure())) return { ok: false, error: this.error || 'motor indisponível' };
    try {
      return await this.request('POST', '/noticias', { assunto, quantidade }, 30000);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  kill() {
    const child = this.child;
    this.child = null;
    this.port = null;
    if (this.state !== 'starting') this.state = 'stopped';
    if (!child || child.killed) return;
    try {
      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {});
      } else {
        child.kill();
      }
    } catch {
      // já foi
    }
  }

  stop() {
    this.state = 'stopped';
    this.kill();
  }
}

module.exports = { Engine, engine: new Engine() };
