'use strict';

// Updates straight from the GitHub releases: electron-updater reads latest.yml, downloads the
// new installer in the background and installs it when she restarts. The portable build runs
// from a temporary folder and can't replace itself, so it only points to the releases page.

const { app, shell, Notification } = require('electron');

const RELEASES = 'https://github.com/felipe2026raji-hue/daenarys-assistente/releases/latest';
const CHECK_AFTER_MS = Number(process.env.CAPRI_UPDATE_MS) || 25000;

let loaded = false;
let up = null;
let listeners = new Set();
let state = { status: 'idle', version: null, percent: 0, error: null };
let scheduled = false;

// The portable build sets this: it has no installed folder to update.
function isPortable() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

function updater() {
  if (loaded) return up;
  loaded = true;
  try {
    up = require('electron-updater').autoUpdater;
  } catch (err) {
    console.error('[capri] electron-updater indisponível:', err.message);
    up = null;
  }
  return up;
}

function emit(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) {
    try {
      fn({ ...state });
    } catch (err) {
      console.error('[capri] update listener:', err.message);
    }
  }
}

// Who listens: main.js, to redraw the menu and to tell you when it's ready.
function init(onChange) {
  if (onChange) listeners.add(onChange);
  const u = updater();
  if (!u) {
    emit({ status: 'unavailable' });
    return;
  }
  u.autoDownload = true;
  u.autoInstallOnAppQuit = true; // the next time she quits, the new version goes in
  u.allowPrerelease = false;
  u.on('checking-for-update', () => emit({ status: 'checking', error: null }));
  u.on('update-available', (info) => emit({ status: 'available', version: info?.version || null, percent: 0 }));
  u.on('update-not-available', (info) => emit({ status: 'none', version: info?.version || null }));
  u.on('download-progress', (p) => emit({ status: 'downloading', percent: Math.round(p?.percent || 0) }));
  u.on('update-downloaded', (info) => emit({ status: 'ready', version: info?.version || null, percent: 100 }));
  u.on('error', (err) => emit({ status: 'error', error: String(err?.message || err) }));
}

// A check now (manual) or a quiet one at startup. Never throws: a release server that is down
// must not get in the way of her day.
async function check() {
  if (!app.isPackaged) {
    emit({ status: 'dev' });
    return { ...state };
  }
  if (isPortable()) {
    emit({ status: 'portable' });
    return { ...state };
  }
  const u = updater();
  if (!u) {
    emit({ status: 'unavailable' });
    return { ...state };
  }
  try {
    await u.checkForUpdates();
  } catch (err) {
    emit({ status: 'error', error: String(err?.message || err) });
  }
  return { ...state };
}

// Once at startup, after she has settled (and only if you left it on).
function start({ enabled = true, delay = CHECK_AFTER_MS } = {}) {
  if (scheduled || !enabled) return;
  scheduled = true;
  const timer = setTimeout(() => check().catch(() => {}), delay);
  timer.unref?.();
}

// Restart into the new version. The engine goes down with the app (main.js, will-quit).
function install() {
  const u = updater();
  if (!u || state.status !== 'ready') return false;
  setImmediate(() => {
    try {
      u.quitAndInstall(false, true);
    } catch (err) {
      console.error('[capri] não consegui instalar a atualização:', err.message);
    }
  });
  return true;
}

function openReleases() {
  shell.openExternal(RELEASES);
}

function current() {
  return { ...state };
}

// A native Windows notification, or the tray balloon where that isn't available.
function tell(title, body) {
  try {
    const icon = require('node:path').join(__dirname, '..', '..', 'assets', 'icons', 'capri.ico');
    if (Notification.isSupported()) {
      new Notification({ title, body, icon }).show();
      return;
    }
  } catch (err) {
    console.error('[capri] notificação:', err.message);
  }
}

module.exports = { init, start, check, install, openReleases, current, tell, isPortable, RELEASES };
