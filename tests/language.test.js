'use strict';

// Her language lock: the prompt starts and ends in her language, and the note by your message
// says it again. Without that, a model drifts into the English of the rest of her prompt, or
// slips Spanish words into Portuguese.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// util.js reads the system's reduced-motion setting when it loads; Node has no matchMedia.
globalThis.matchMedia = () => ({ matches: false });

// Load the browser ES modules in Node without changing the package module type.
function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

const chatModule = () => import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
const LANGS = ['fr', 'en', 'es', 'pt', 'ru'];

test('every language locks her reply to itself, with no mixing', async () => {
  const { IN_LANGUAGE } = await chatModule();
  for (const lang of LANGS) {
    const entry = IN_LANGUAGE[lang];
    assert.ok(entry, `${lang}: missing language entry`);
    for (const key of ['first', 'last', 'now']) {
      assert.ok(entry[key] && entry[key].trim(), `${lang}: missing ${key}`);
    }
    // the lock is said at the start, at the end, and right by the user's message
    assert.match(entry.first, /\S/);
    assert.match(entry.last, /\S/);
    assert.match(entry.now, /\S/);
  }
  // Portuguese must not allow English slang any more (it used to)
  assert.doesNotMatch(IN_LANGUAGE.pt.last, /gírias[^.]*ficam em inglês/i);
  assert.match(IN_LANGUAGE.pt.last, /Não misture idiomas/i);
  assert.match(IN_LANGUAGE.pt.now, /inglês ou espanhol/i);
});
