'use strict';

// Her words and her menu have to stay complete in every language: a missing key
// is a blank line on screen, and it only shows up when someone switches language.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TRAY, LANGS } = require('../src/main/labels');

// Load the browser ES modules in Node without changing the package module type.
function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

const linesModule = () => import(moduleUrl(path.join(__dirname, '../src/renderer/js/lines.js')));

// What the tray menu and the settings card read from labels.js.
const MENU_KEYS = [
  'name', 'online', 'talk', 'listen', 'news', 'reminders', 'custom', 'settings',
  'quick', 'lookSection', 'brain', 'more', 'sound', 'mute', 'soundsDir',
  'spark', 'voiceFollow', 'voiceOn', 'voiceSpeak', 'voiceAlways', 'newsStart',
  'mic', 'micAuto', 'micNone',
  'size', 'small', 'medium', 'large', 'theme', 'themeClassic', 'motion',
  'lang', 'auto', 'startup', 'show', 'hide',
  'updateCheck', 'updateChecking', 'updateDownloading', 'updateReady',
  'updateReadyBody', 'updateNone', 'updateError', 'updatePortable', 'updateAuto',
  'logs', 'copyDiag', 'diagCopied', 'keyNoSafe',
];

// Every string the settings card renders (settings.js).
const SETTINGS_KEYS = [
  'title', 'hint', 'close',
  'voice', 'voiceOn', 'alwaysListen', 'alwaysListenNote', 'chatFollow', 'chatFollowNote', 'speakReplies',
  'mic', 'micAuto',
  'company', 'spark', 'sparkNote', 'pcReact', 'pcNote', 'lookAuto', 'lookNote', 'jealous', 'closePages',
  'wander', 'possess', 'newsStart',
  'lookSection', 'size', 'small', 'medium', 'large', 'theme', 'neon', 'classic',
  'motion', 'motionAuto', 'motionFull', 'motionReduced', 'rest', 'restCorner', 'restTaskbar', 'muted',
  'system', 'lang', 'auto', 'customize', 'model', 'sounds', 'logs', 'menu',
];

test('menu and settings card are complete in every language', async () => {
  const { linesFor } = await linesModule();
  // A few labels are functions (online(), sync(percent, stage)); they still have to speak.
  const textOf = (value) => {
    if (typeof value === 'function') return String(value(42, 'x'));
    return value;
  };
  for (const lang of LANGS) {
    assert.ok(TRAY[lang], `TRAY.${lang}`);
    for (const key of MENU_KEYS) {
      const value = textOf(TRAY[lang][key]);
      assert.equal(typeof value, 'string', `TRAY.${lang}.${key}`);
      assert.ok(value.trim(), `TRAY.${lang}.${key} vazio`);
    }
    const settings = linesFor(lang).settings;
    assert.ok(settings, `${lang}.settings`);
    for (const key of SETTINGS_KEYS) {
      const value = textOf(settings[key]);
      assert.equal(typeof value, 'string', `${lang}.settings.${key}`);
      assert.ok(value.trim(), `${lang}.settings.${key} vazio`);
    }
  }
});

test('her base lines have the same shape in every language', async () => {
  const { LINES } = await linesModule();
  const base = Object.keys(LINES.fr).sort();
  for (const [lang, lines] of Object.entries(LINES)) {
    assert.deepEqual(Object.keys(lines).sort(), base, `${lang} tem chaves diferentes`);
  }
});

test('the extra lines (spark, play, settings) reach every language', async () => {
  const { linesFor } = await linesModule();
  for (const lang of LANGS) {
    const text = linesFor(lang);
    for (const key of ['spark', 'play', 'settings']) assert.ok(text[key], `${lang}.${key}`);
    assert.equal(typeof text.settings.title, 'string');
    assert.equal(typeof text.spark.night?.length, 'number');
    assert.equal(typeof text.play.rpsAsk, 'string');
  }
});
