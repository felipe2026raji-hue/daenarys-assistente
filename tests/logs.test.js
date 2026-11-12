'use strict';

// Her diary and her key safe: what goes into the log must never carry a key, the file must
// rotate instead of growing forever, and a key that can't be encrypted must not be saved.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const log = require('../src/main/log');
const keys = require('../src/main/keys');

const SEGREDOS = [
  'sk-proj-AbCdEfGhIjKlMnOpQrStUv',
  'AIzaSyA1234567890abcdefghijklmnop',
  'gsk_AbCdEfGhIjKlMnOpQrSt',
  'xoxb-123456789012-abcdefghij',
  'hf_AbCdEfGhIjKlMnOpQrSt',
];

test('the log scrubs every key it meets', () => {
  const sujo = [
    ...SEGREDOS,
    'Authorization: Bearer abcdefghijklmnopqrst',
    '{"api_key": "abcdef1234567890"}',
    'apiKey=abcdef1234567890',
  ].join(' | ');
  const limpo = log.limpar(sujo);
  for (const segredo of SEGREDOS) {
    assert.ok(!limpo.includes(segredo), `a chave vazou: ${segredo}`);
  }
  assert.doesNotMatch(limpo, /Bearer\s+abcdefghijklmnopqrst/);
  assert.doesNotMatch(limpo, /abcdef1234567890/);
  // and it still says where the key was, for reading the log later
  assert.match(limpo, /sk-…/);
  assert.match(limpo, /api_key/);
});

test('the log writes, rotates and keeps no key on disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daenarys-log-'));
  const arquivo = log.iniciar(dir);
  assert.equal(arquivo, path.join(dir, 'daenarys.log'));
  // a 4000-character line, ~150 times: past the 512 KB limit, so it rotates
  for (let i = 0; i < 200; i++) {
    log.erro('teste', `${SEGREDOS[0]} ${'x'.repeat(3900)}`);
  }
  const atual = fs.statSync(path.join(dir, 'daenarys.log')).size;
  assert.ok(atual < 512 * 1024 + 4096, `o log passou do limite: ${atual}`);
  assert.ok(fs.existsSync(path.join(dir, 'daenarys.log.1')), 'o log antigo não foi guardado');
  const tudo = fs.readdirSync(dir).map((nome) => fs.readFileSync(path.join(dir, nome), 'utf8')).join('\n');
  assert.ok(!tudo.includes(SEGREDOS[0]), 'a chave ficou gravada no log');
  assert.match(tudo, /\[teste\]/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the diagnostics report says how she is, and never a key', () => {
  log.contexto(() => ({
    idioma: 'pt', idiomaEscolhido: 'auto', provedor: 'gemini', modelo: 'gemini-3.6-flash',
    chaves: 'gemini', motor: 'pronto (porta 1234)', atualizacao: 'none 0.5.7',
  }));
  log.erro('chaves', `falhou com ${SEGREDOS[1]}`);
  const relatorio = log.relatorio();
  assert.match(relatorio, /Daenarys \d+\.\d+\.\d+/);
  assert.match(relatorio, /idioma: pt/);
  assert.match(relatorio, /provedor: gemini/);
  assert.match(relatorio, /motor de voz: pronto/);
  assert.ok(!relatorio.includes(SEGREDOS[1]), 'a chave vazou no relatório');
});

test('a key is only saved encrypted, never in plain text', () => {
  // Outside the app there is no safe storage: sealing must refuse instead of handing back the key
  assert.equal(keys.disponivel(), false);
  assert.throws(() => keys.selar('sk-plain-text-key'), /no-safe-storage/);
  // reading: sealed values are opened by the app; a plain one passes through; a foreign one is empty
  assert.equal(keys.abrir('sk-plain-text-key'), 'sk-plain-text-key');
  assert.equal(keys.abrir('enc:bm90LXVtLWNvZnJl'), '');
  assert.equal(keys.selada('enc:bm90LXVtLWNvZnJl'), true);
  assert.equal(keys.selada('sk-plain-text-key'), false);
});
