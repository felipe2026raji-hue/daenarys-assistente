#!/usr/bin/env node
'use strict';

// Packs the local engine (voz + notícias, engine/) into a standalone executable
// with PyInstaller, so the installed app doesn't need Python on the PC.
//
//   npm run engine:build
//
// Result: engine/dist/servidor/servidor.exe (+ its _internal folder).
// Run it again after changing any engine/*.py file; `npm run dist` ships it.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const engineDir = path.join(root, 'engine');
const venvPython = path.join(engineDir, '.venv', 'Scripts', 'python.exe');
const out = path.join(engineDir, 'dist', 'servidor', 'servidor.exe');

function fail(message) {
  console.error(`\n[motor] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(venvPython)) {
  fail('engine\\.venv não existe. Rode `npm run engine:setup` primeiro.');
}

const run = (args, { quiet = false } = {}) => spawnSync(venvPython, args, {
  cwd: engineDir,
  stdio: quiet ? 'pipe' : 'inherit',
  encoding: 'utf8',
});

// PyInstaller is a build tool, not something the app needs at runtime: install it
// on demand from engine/requirements-build.txt.
const probe = run(['-m', 'PyInstaller', '--version'], { quiet: true });
if (probe.status !== 0) {
  console.log('[motor] instalando o empacotador (PyInstaller)…');
  const install = run(['-m', 'pip', 'install', '-r', 'requirements-build.txt']);
  if (install.status !== 0) fail('não consegui instalar o PyInstaller.');
}

console.log('[motor] empacotando engine/ em um executável…');
const build = run(['-m', 'PyInstaller', '--noconfirm', '--clean', 'servidor.spec']);
if (build.status !== 0) fail('o PyInstaller falhou (veja o log acima).');
if (!fs.existsSync(out)) fail('o PyInstaller terminou mas não gerou servidor.exe.');

const size = fs.statSync(out).size;
const folder = fs.readdirSync(path.dirname(out)).length;
console.log(`[motor] pronto: ${out}`);
console.log(`[motor] ${(size / 1024 / 1024).toFixed(1)} MB + ${folder - 1} arquivo(s) em _internal/`);
console.log('[motor] rode `npm run dist` para gerar o instalador com ele dentro.');
