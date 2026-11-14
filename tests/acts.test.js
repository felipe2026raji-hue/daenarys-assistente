'use strict';

// Her gestures have to be whole exposure sheets: a few drawings, each held for a positive number
// of frames. A typo here is an act that ends on its first drawing, or a pose that never shows.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load the browser ES modules in Node without changing the package module type.
function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

const actingModule = () => import(moduleUrl(path.join(__dirname, '../src/renderer/js/acting.js')));

// What the 2D renderer actually draws: arms, legs and the mane are inert on this cut-out, so a
// gesture built out of them would not move at all.
const VISIBLE = new Set(['head', 'hair', 'tilt', 'bob', 'sx', 'sy', 'smear', 'echo']);

test('her new gestures are whole acts, drawn with what the sprite can move', async () => {
  const { ACTS } = await actingModule();
  for (const name of ['dance', 'bow', 'yawn', 'nod', 'swat', 'evade', 'giggle', 'ponder', 'sneeze']) {
    const act = ACTS[name];
    assert.ok(act, `${name}: missing from ACTS`);
    assert.ok(Array.isArray(act.keys) && act.keys.length >= 4, `${name}: too few drawings`);
    for (const [hold, pose] of act.keys) {
      assert.ok(Number.isInteger(hold) && hold > 0, `${name}: bad hold`);
      assert.equal(typeof pose, 'object', `${name}: bad pose`);
      for (const field of Object.keys(pose)) {
        assert.ok(VISIBLE.has(field), `${name}: "${field}" does not move the 2D sprite`);
      }
    }
  }
});

test('every act holds for a while, and a player samples it', async () => {
  const { ACTS, Player } = await actingModule();
  for (const [name, act] of Object.entries(ACTS)) {
    assert.ok(Array.isArray(act.keys) && act.keys.length, `${name}: no drawings`);
    const player = new Player(name);
    assert.ok(player.total > 0, `${name}: no frames`);
    assert.ok(player.sample(player.start)?.pose, `${name}: nothing at the start`);
  }
});

test('an act with a sheet gives one cel per drawing, ready for the frame-by-frame art', async () => {
  const { ACTS, Player } = await actingModule();
  const act = ACTS.nod;
  const before = act.sheet;
  act.sheet = { cols: 4, from: 2 };
  try {
    const player = new Player('nod');
    assert.deepEqual(player.sheetFrame(player.start), { cols: 4, from: 2, frame: 2 });
    // the second drawing (the first is held for one frame at 24 fps)
    assert.equal(player.sheetFrame(player.start + 1000 / 24 * 1.5).frame, 3);
  } finally {
    if (before === undefined) delete act.sheet;
    else act.sheet = before;
  }
  assert.equal(new Player('nod').sheetFrame(performance.now()), null);
});
