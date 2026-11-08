'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = {
  scale: 0.6,        // sprite scale, 0.6 ≈ 250px tall
  muted: false,
  volume: 0.7,
  lang: 'auto',      // 'auto' follows the system language, or 'fr' / 'en'
  displayId: null,   // null = primary display
  wander: true,      // random teleports when idle
  possess: true,     // now and then she dives into the window she sits on and takes it over
  visible: true,
  welcomed: false,   // she has introduced herself (her welcome panel)
  assistant: 'auto', // the coding assistant she watches: 'claude' or 'codex' ('auto': whichever has her hooks)
  linked: false,     // a Claude Code event has reached her at least once
  chatModel: null,   // the model she talks with (null: the provider's first one)
  provider: 'ollama', // who answers her chat: a key of llm.js PROVIDERS
  apiKeys: {},       // { openai: 'sk-...' }, else the provider's env variable
  customUrl: '',     // the 'custom' provider: any OpenAI-compatible base URL (http://host:port/v1)
  claudeCwd: null,   // the folder Claude Code works in (null: your home folder)
  userName: '',      // what she calls you
  persona: '',       // how you want her, in your words (her chat)
  myLines: [],       // lines of yours she says now and then, with hers
  memories: [],      // things you asked her to remember (her chat)
  claudeMode: 'default', // Claude Code's permission mode in her chat: 'default' only reads, 'acceptEdits' edits without asking
  claude: true,      // she watches Claude Code (off: she just keeps you company, no word of it)
  rest: 'corner',    // where she rests when nothing's going on: 'corner', or 'taskbar' (sitting on it)
  theme: 'nightcity', // her windows: 'nightcity' (the cyberpunk.net HUD) or 'classic' (her first ones, violet)
  motion: 'auto',    // her animations: 'auto' (like Windows' animation effects), 'full' or 'reduced'
  motionAsked: false, // she asked once, Windows' animations being off, whether to move anyway
  render: 'auto',   // how her window is drawn: 'auto', 'gl' (OpenGL) or 'software' (no graphics card), for PCs that show it black
  follow: true,      // with several screens, she follows the pointer to the one you're on
  jealous: true,     // she gets jealous when she sees you on another AI (bond.js)
  closePages: true,  // jealous, she closes their pages in your browser, and pages to download them
  reminders: [],     // the reminders she keeps: [{ id, at, text, made }] (reminders.js)
  bond: null,        // how close she is to you: { xp, first, last, days, streak, caps } (bond.js)
  pcReact: true,     // she reacts to your PC: the processor at full tilt, the battery, the network, a USB stick, a game (pc.js)
  spark: true,       // she starts the conversation now and then: a memory, a late night, a long session (spark.js)
  watchScreen: false, // she looks at your screen now and then and says something about it (look.js)
  lookAsked: false,  // she told you what looking means (where the picture goes) and you said yes

  // voz pt-BR (motor local em engine/): falar as respostas e ouvir pelo microfone
  voice: true,           // liga a voz (falar e ouvir)
  mic: '',               // microfone da escuta (nome); vazio = escolhe sozinho
  speakReplies: true,    // fala tudo o que ela diz em voz alta
  alwaysListen: true,    // escuta contínua: acorda com a palavra de ativação ("Daenarys")
  chatFollow: true,      // depois de uma fala por voz, continua ouvindo por alguns segundos sem o nome dela
  listenHotkey: 'Control+Alt+J', // atalho global para começar a ouvir
  newsOnStart: true,     // lê as manchetes quando ela abre
  newsEveryMin: 30,      // não repete o boletim de abertura antes disso
  newsLast: 0,           // quando o último boletim foi dado (ms)
};

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load(fresh = false) {
  if (cache && !fresh) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[capri] could not save config:', err.message);
  }
  return cache;
}

module.exports = { load, save, file, DEFAULTS };
