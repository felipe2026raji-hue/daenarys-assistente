'use strict';

// Opening things when you ask her to (chat.js): an app from the Start menu (Store apps like Spotify
// included), a Steam or Epic game, your music (the media keys: pause, next…, so it works with
// Spotify and most players), a Spotify search, or a website. Windows only.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { app, shell } = require('electron');
const { powershell } = require('./apps');

const WIN = process.platform === 'win32';
// not things to open from a chat: uninstallers, help pages and the like
const SKIP = /uninstall|désinstaller|desinstalar|deinstall|readme|documentation|release notes|support center|website|manual/i;
const STEAM_SKIP = /redistributable|dedicated server|steamworks/i;
// words that don't tell apps apart ("Roblox Player" is "roblox", "AM Music" is "am")
const FILLER = new Set(['player', 'launcher', 'app', 'the', 'for', 'windows', 'desktop', 'client', 'x64', 'x86', 'beta', 'music', 'musique', 'media', 'audio', 'video', 'videos']);
const CACHE_MS = 10 * 60 * 1000; // installed apps hardly change

let cache = null; // { at, items }

const plain = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const words = (text) => plain(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);

// Everything she can open: [{ name, kind: 'app' | 'steam' | 'epic', id }]
async function launchables() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  if (!WIN) return [];
  const items = [];
  const seen = new Set();
  const add = (item) => {
    const key = words(item.name).join(' ');
    if (!key || seen.has(key) || SKIP.test(item.name)) return;
    seen.add(key);
    items.push(item);
  };
  // games first: a game's own entry wins over a shortcut to it
  for (const game of [...steamGames(await steamRoot()), ...epicGames()]) add(game);
  // the Start menu's list is slow the first time (PowerShell starting cold): main.js asks for it early
  const out = await powershell('Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress', 45000).catch(() => null);
  for (const { Name, AppID } of [].concat(out ? JSON.parse(out) : [])) {
    if (Name && AppID && !/^https?:/i.test(AppID)) add({ name: Name, kind: 'app', id: AppID });
  }
  if (out !== null) cache = { at: Date.now(), items }; // a list that failed isn't kept: next time, again
  return items;
}

function steamRoot() {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      const found = !err && /SteamPath\s+REG_SZ\s+(.+)/.exec(String(out))?.[1].trim();
      resolve(found ? path.normalize(found) : null);
    });
  });
}

// Steam's games, from the manifests in each of its libraries
function steamGames(root) {
  if (!root) return [];
  const libraries = new Set([root]);
  try {
    const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.add(path.normalize(m[1].replace(/\\\\/g, '\\')));
  } catch {
    // one library, the main one
  }
  const games = [];
  for (const library of libraries) {
    let files = [];
    try {
      files = fs.readdirSync(path.join(library, 'steamapps')).filter((f) => /^appmanifest_\d+\.acf$/.test(f));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const acf = fs.readFileSync(path.join(library, 'steamapps', file), 'utf8');
        const id = /"appid"\s+"(\d+)"/.exec(acf)?.[1];
        const name = /"name"\s+"([^"]+)"/.exec(acf)?.[1];
        if (id && name && !STEAM_SKIP.test(name)) games.push({ name, kind: 'steam', id });
      } catch {
        // a manifest being written: skip it
      }
    }
  }
  return games;
}

// Epic's games, from its launcher's manifests (not the Unreal Engine plugins it also keeps there)
function epicGames() {
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.item'));
  } catch {
    return [];
  }
  const games = [];
  for (const file of files) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (m.bIsIncompleteInstall || m.CatalogNamespace === 'ue' || !m.DisplayName || !m.AppName) continue;
      games.push({ name: m.DisplayName, kind: 'epic', id: `${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}` });
    } catch {
      // not one of its manifests
    }
  }
  return games;
}

// The one of `items` named in `text` (your message, or the name in her tag): all the words of its
// name in it, else at least half of them; the closest wins. null if nothing fits well enough.
function match(items, text) {
  const said = new Set(words(text));
  const joined = words(text).join('');
  let best = null;
  for (const item of items) {
    const all = words(item.name);
    const key = all.filter((w) => !FILLER.has(w));
    if (!key.length) key.push(...all); // a name made only of those ("Media Player"): all of it
    if (!key.length) continue;
    const hits = key.filter((w) => said.has(w) || (w.length >= 5 && joined.includes(w)));
    // a word of 3 letters or more, or all of a short name ("am" for AM Music)
    if (!(hits.some((w) => w.length >= 3) || hits.length === key.length) || hits.length / key.length < 0.5) continue;
    const rank = (hits.length / key.length) * 10 + hits.join('').length / 10;
    if (!best || rank > best.rank) best = { item, rank };
  }
  return best?.item || null;
}

// What's on your desktop (yours and the shared one): files, folders and shortcuts, by name.
function desktopItems() {
  const dirs = [app.getPath('desktop'), path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')];
  const items = [];
  for (const dir of dirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || /^desktop\.ini$/i.test(e.name)) continue;
      const folder = e.isDirectory();
      items.push({ name: folder ? e.name : e.name.replace(/\.[^.]+$/, ''), kind: folder ? 'folder' : 'file', id: path.join(dir, e.name) });
    }
  }
  return items;
}

// files that run something: never opened without a click, even named by you
const RUNS = /\.(exe|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|msi|msp|reg|scr|com|jar|hta|cpl|pif)$/i;
const risky = (item) => item?.kind === 'file' && RUNS.test(item.id);

// Folders asked for by what they are ("ouvre mes téléchargements", "open the file explorer").
const FOLDERS = [
  ['explorer', /explorateur|file explorer|\bexplorer\b|ce pc|this pc|explorador|проводник/i],
  ['recycle', /corbeille|recycle bin|\btrash\b|papelera|lixeira|корзин/i],
  ['downloads', /t[ée]l[ée]chargements?|downloads?|descargas|transfer[êe]ncias|загрузк/i],
  ['desktop', /\bbureau\b|\bdesktop\b|escritorio|[áa]rea de trabalho|рабоч\S* стол/i],
  ['documents', /\bdocuments?\b|documentos|документ/i],
  ['pictures', /\bimages\b|\bphotos\b|\bpictures\b|im[áa]genes|\bfotos\b|imagens|изображени|фото/i],
  ['music', /dossier (de )?musique|music folder|carpeta de m[úu]sica|pasta de m[úu]sica|папк\S* (с )?музык/i],
  ['videos', /\bvid[ée]os\b|v[íi]deos|видео/i],
];

function knownFolder(text) {
  const hit = FOLDERS.find(([, re]) => re.test(text));
  return hit ? { name: hit[0], kind: 'known', id: hit[0] } : null;
}

// "ouvre C:\Users\…", "abre %USERPROFILE%\Documents", "open ~/Projects": a real folder on the PC.
const PATH_IN = /(?:[a-z]:[\\/]|%[^%\s]+%[\\/]?|~[\\/])[^"'<>|?*\r\n]*/i;
const FOLDER_WORD = /pasta|pastas|dossier|dossiers|folder|folders|carpeta|carpetas|diret[óo]rio|directory|папк|каталог/i;

function pathIn(text) {
  const m = PATH_IN.exec(String(text || ''));
  if (!m) return null;
  return m[0]
    .replace(/\s+(?:por favor|please|svp|stp|пожалуйста)$/i, '')
    .replace(/[\s.!?,;:]+$/, '')
    .trim();
}

function expandPath(raw) {
  let p = String(raw || '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  p = p.replace(/%([^%]+)%/g, (_m, key) => process.env[key] || process.env[key.toUpperCase()] || '');
  if (/^~[\\/]/.test(p)) p = path.join(app.getPath('home'), p.slice(2));
  return p;
}

function folderAt(text) {
  const raw = pathIn(text);
  if (!raw) return null;
  const full = path.resolve(expandPath(raw));
  try {
    if (!fs.statSync(full).isDirectory()) return null;
  } catch {
    return null;
  }
  return { name: path.basename(full) || full, kind: 'dir', id: full };
}

// Folders asked for by their name ("ouvre le dossier Projets", "abre a pasta Faculdade"): a walk
// through the folders you actually use, a couple of levels down.
const FOLDER_STOP = new Set(('pasta pastas dossier dossiers folder folders carpeta carpetas diretorio directory '
  + 'abre abrir abra open ouvre ouvrir mostra mostrar show exibe exibir a o as os um uma uns umas the '
  + 'my meus minhas meu minha mis el la los las le les mon ma mes ton ta tes seu sua seus suas '
  + 'de do da dos das du des no na nos nas em en in в на каталог папка папку папки').split(' '));

function namedFolder(text) {
  const terms = words(text).filter((w) => w.length >= 2 && !FOLDER_STOP.has(w));
  if (!terms.length) return null;
  const roots = [...new Set(['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos']
    .map((k) => app.getPath(k)).concat(app.getPath('home')))];
  let seen = 0;
  const hits = [];
  const walk = (dir, depth) => {
    if (seen > 8000 || hits.length >= 20) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (seen++ > 8000 || hits.length >= 20) return;
      if (!e.isDirectory() || e.name.startsWith('.') || /^(?:node_modules|appdata|\.git)$/i.test(e.name)) continue;
      const full = path.join(dir, e.name);
      const key = words(e.name).join(' ');
      if (terms.every((t) => key.includes(t))) hits.push(full);
      if (depth < 2) walk(full, depth + 1);
    }
  };
  for (const root of roots) {
    walk(root, 0);
    if (hits.length) break;
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length || a.length - b.length);
  const full = hits[0];
  return { name: path.basename(full), kind: 'dir', id: full };
}

// A folder by its path or by its name, opened right away (files:folder in main.js).
async function openFolder(text) {
  const item = pathIn(text) ? folderAt(text) : namedFolder(text);
  if (!item) return null;
  const err = await shell.openPath(item.id);
  if (err) return null;
  return { path: item.id, name: item.name };
}

function openKnown(id) {
  if (id === 'explorer') return spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  if (id === 'recycle') return spawn('explorer.exe', ['shell:RecycleBinFolder'], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return shell.openPath(app.getPath(id));
}

// What you asked to open: a folder by its path or name, an app or a game, something on your
// desktop, else a folder by what it is.
async function find(text) {
  const folder = folderAt(text);
  if (folder) return folder;
  if (FOLDER_WORD.test(text)) {
    const known = knownFolder(text);
    if (known) return known;
    const named = namedFolder(text);
    if (named) return named;
  }
  return match([...desktopItems(), ...(await launchables())], text) || knownFolder(text);
}

// Opens one of them (only something she listed herself): a Start menu app through its AppsFolder
// entry (desktop and Store apps alike), a game through its launcher's link, a file or folder from
// your desktop, a folder by what it is.
async function launch({ kind, id } = {}) {
  if (kind === 'known') {
    if (!FOLDERS.some(([key]) => key === id)) throw new Error('not found');
    await openKnown(id);
    return undefined;
  }
  if (kind === 'dir') {
    let stat = null;
    try {
      stat = fs.statSync(id);
    } catch {
      throw new Error('not found');
    }
    if (!stat.isDirectory()) throw new Error('not found');
    const err = await shell.openPath(id);
    if (err) throw new Error(err);
    return undefined;
  }
  if (kind === 'file' || kind === 'folder') {
    if (!desktopItems().some((i) => i.id === id)) throw new Error('not found');
    const err = await shell.openPath(id);
    if (err) throw new Error(err);
    return undefined;
  }
  const item = (await launchables()).find((i) => i.kind === kind && i.id === id);
  if (!item) throw new Error('not found');
  if (kind === 'steam') return shell.openExternal(`steam://rungameid/${id}`);
  if (kind === 'epic') return shell.openExternal(`com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=launch&silent=true`);
  spawn('explorer.exe', [`shell:AppsFolder\\${id}`], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return undefined;
}

// The media keys, as if pressed on the keyboard: whatever plays music (Spotify, a browser…) reacts.
// Play and pause are the same key; the volume moves a few steps at a time. Sent as keys (their virtual
// key codes), not typed: typed, they come out as "³" or "°" on a German keyboard.
const MEDIA = { pause: [0xb3, 1], play: [0xb3, 1], next: [0xb0, 1], previous: [0xb1, 1], volup: [0xaf, 5], voldown: [0xae, 5], mute: [0xad, 1] };
const KEY_DOWN = 1; // KEYEVENTF_EXTENDEDKEY
const KEY_UP = 3;   // ...and KEYEVENTF_KEYUP

async function media(action) {
  if (!WIN || !MEDIA[action]) return false;
  const [key, times] = MEDIA[action];
  return powershell(
    'Add-Type -Namespace Capri -Name Keys -MemberDefinition \'[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);\'; '
    + `1..${times} | ForEach-Object { [Capri.Keys]::keybd_event(${key}, 0, ${KEY_DOWN}, [UIntPtr]::Zero); [Capri.Keys]::keybd_event(${key}, 0, ${KEY_UP}, [UIntPtr]::Zero) }`,
  ).then(() => true, () => false);
}

// A Spotify search for it: in the app if it's installed, else on the web.
async function music(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return false;
  try {
    await shell.openExternal(`spotify:search:${encodeURIComponent(q)}`);
  } catch {
    await shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(q)}`);
  }
  return true;
}

// A song on YouTube, the exact video: the first result of a search (no key needed), opened in your
// browser. { title } of what it found, or { title: null } when it could only open the search.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const VIDEO = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/;

async function youtube(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return null;
  const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  let video = null;
  try {
    const res = await fetch(search, {
      // the consent cookie skips Europe's cookie page, which would hide the results
      headers: { 'user-agent': UA, 'accept-language': 'en', cookie: 'CONSENT=YES+1; SOCS=CAI' },
      signal: AbortSignal.timeout(8000),
    });
    const m = VIDEO.exec(await res.text());
    if (m) video = { id: m[1], title: JSON.parse(`"${m[2]}"`) };
  } catch {
    // offline or YouTube changed its page: the search still opens
  }
  await shell.openExternal(video ? `https://www.youtube.com/watch?v=${video.id}` : search);
  return { title: video?.title || null };
}

// A Roblox game by its name ("steal a brain rot"): the first one Roblox's own search gives, started
// straight in the Roblox app through its roblox:// link, or its page in the browser without the app.
// { name, app } of what it started, { name: null } if Roblox found nothing.
async function roblox(query) {
  const q = String(query || '').trim().slice(0, 100);
  if (!q) return null;
  let game = null;
  try {
    const url = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(q)}&pageType=all&sessionId=${randomUUID()}`;
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    game = (body.searchResults || []).filter((r) => r.contentGroupType === 'Game').flatMap((r) => r.contents || [])[0] || null;
  } catch {
    return null;
  }
  if (!game?.rootPlaceId) return { name: null };
  const installed = Boolean(app.getApplicationNameForProtocol('roblox://'));
  await shell.openExternal(installed ? `roblox://experiences/start?placeId=${game.rootPlaceId}` : `https://www.roblox.com/games/${game.rootPlaceId}`);
  // "[💀] Steal a Brainrot" is "Steal a Brainrot"
  const name = String(game.name).replace(/\[[^\]]*\]\s*/g, '').replace(/[\p{Extended_Pictographic}️]/gu, '').trim();
  return { name: name || game.name, app: installed };
}

// A website: http or https, with a real host name.
function siteUrl(address) {
  try {
    const url = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}

async function site(address) {
  const url = siteUrl(String(address || '').trim());
  if (!url) return false;
  await shell.openExternal(url.toString());
  return true;
}

module.exports = { launchables, match, find, launch, media, music, youtube, roblox, site, siteUrl, risky, openFolder };
