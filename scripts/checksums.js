#!/usr/bin/env node
'use strict';

// SHA256SUMS.txt for what `npm run dist` left in dist/, so anyone can check a
// download before running it:  certutil -hashfile Daenarys-Setup-0.5.1.exe SHA256
//
//   npm run checksums

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.resolve(__dirname, '..', 'dist');
const files = fs.readdirSync(dist).filter((f) => /\.exe$/i.test(f)).sort();

if (!files.length) {
  console.error('[checksums] nada em dist/ — rode `npm run dist` primeiro.');
  process.exit(1);
}

const lines = files.map((file) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, file))).digest('hex');
  return `${hash}  ${file}`;
});

const out = path.join(dist, 'SHA256SUMS.txt');
fs.writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
console.log(`\n[checksums] ${out}`);
