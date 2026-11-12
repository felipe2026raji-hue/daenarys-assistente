// The panel with every switch in one place: "Ajustes…" in her menu.
// Grouped by what you came to change, each switch saves the moment you touch it.
// Everything it shows comes from the config (main.js), so the tray menu and this
// panel never disagree.

const LANGS = [
  ['auto', null], // her name for it, from the lines
  ['fr', 'Français'],
  ['en', 'English'],
  ['es', 'Español'],
  ['pt', 'Português (Brasil)'],
  ['ru', 'Русский'],
];

const same = (a, b) => (typeof a === 'number' ? Math.abs(a - b) < 0.01 : a === b);

export class Settings {
  constructor({ host, brain, closeOthers, lookSetAuto, customize, model, onClose }) {
    this.host = host;
    this.brain = brain;
    this.closeOthers = closeOthers;
    this.lookSetAuto = lookSetAuto;
    this.customize = customize;
    this.model = model;
    this.onClose = onClose;
    this.el = document.getElementById('settings');
    this.body = this.el.querySelector('.settings__body');
    this.foot = this.el.querySelector('.settings__foot');
    this.title = this.el.querySelector('.settings__title');
    this.hint = this.el.querySelector('.settings__hint');
    this.visible = false;
    this.cfg = {};
    this.mics = []; // microfones que o motor ofereceu (open())
    this.controls = new Map();
    this.renderedLang = null;
    this.el.querySelector('.settings__close').addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (this.visible && e.key === 'Escape') this.close();
    });
  }

  get t() {
    return this.brain.t.settings;
  }

  rect() {
    if (!this.visible) return null;
    return this.el.getBoundingClientRect();
  }

  async open() {
    this.closeOthers();
    this.cfg = await this.host.getConfig();
    this.mics = [];
    this.title.textContent = this.t.title;
    this.hint.textContent = this.t.hint;
    this.render();
    this.el.hidden = false;
    this.visible = true;
    this.el.classList.remove('is-entering');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add('is-entering');
    // no keyboard grab: unlike her chat, there is nothing to type here
    this.body.scrollTop = 0; // always opens at the top
    requestAnimationFrame(() => {
      this.body.scrollTop = 0;
    });
    // the engine may still be starting: the picker opens with "Automatic" and fills in when it answers
    this.host.mics().then((res) => {
      if (!this.visible || !Array.isArray(res?.microfones)) return;
      if (res.microfones.join('\n') === this.mics.join('\n')) return;
      this.mics = res.microfones;
      this.render();
    }).catch(() => {});
  }

  close() {
    if (!this.visible) return;
    this.visible = false;
    this.el.hidden = true;
    this.host.focusOverlay(false);
    this.onClose?.();
  }

  // A setting changed somewhere else (the tray menu, her chat): follow it.
  // The language redraws every label, so then the whole panel is built again.
  sync(cfg) {
    this.cfg = cfg;
    if (!this.visible) return;
    if ((cfg.lang || 'fr') !== this.renderedLang) {
      this.title.textContent = this.t.title;
      this.hint.textContent = this.t.hint;
      this.render();
    } else {
      this.refresh();
    }
  }

  // ---------- building ----------

  render() {
    const t = this.t;
    this.renderedLang = this.cfg.lang || 'fr';
    this.controls.clear();
    const groups = [];
    const section = (title) => {
      const group = document.createElement('section');
      group.className = 'settings__group';
      const head = document.createElement('h3');
      head.className = 'settings__group-title';
      head.textContent = title;
      group.append(head);
      groups.push(group);
      return group;
    };

    // Voice
    const voice = section(t.voice);
    this.addSwitch(voice, 'voice', t.voiceOn, null, () => this.cfg.voice !== false);
    this.addSwitch(voice, 'alwaysListen', t.alwaysListen, t.alwaysListenNote,
      () => this.cfg.alwaysListen !== false, () => this.cfg.voice !== false);
    this.addSwitch(voice, 'chatFollow', t.chatFollow, t.chatFollowNote,
      () => this.cfg.chatFollow !== false, () => this.cfg.voice !== false && this.cfg.alwaysListen !== false);
    this.addSwitch(voice, 'speakReplies', t.speakReplies, null,
      () => this.cfg.speakReplies !== false, () => this.cfg.voice !== false);
    this.addSelect(voice, 'mic', t.mic,
      [['', t.micAuto], ...this.mics.map((name) => [name, name])],
      () => this.cfg.mic || '', () => this.cfg.voice !== false);

    // Company: what she does on her own
    const company = section(t.company);
    this.addSwitch(company, 'spark', t.spark, t.sparkNote, () => this.cfg.spark !== false);
    this.addSwitch(company, 'pcReact', t.pcReact, t.pcNote, () => this.cfg.pcReact !== false);
    this.addSwitch(company, 'watchScreen', t.lookAuto, t.lookNote, () => Boolean(this.cfg.watchScreen), null, (next) => {
      if (!next) {
        this.cfg = { ...this.cfg, watchScreen: false };
        this.refresh();
        this.host.setConfig({ watchScreen: false });
        return;
      }
      // she asks first (what she sends where), so this one puts her panel up
      this.close();
      this.lookSetAuto(true);
    });
    this.addSwitch(company, 'jealous', t.jealous, null, () => this.cfg.jealous !== false);
    this.addSwitch(company, 'closePages', t.closePages, null,
      () => this.cfg.closePages !== false, () => this.cfg.jealous !== false);
    this.addSwitch(company, 'wander', t.wander, null, () => Boolean(this.cfg.wander));
    this.addSwitch(company, 'possess', t.possess, null, () => Boolean(this.cfg.possess));
    this.addSwitch(company, 'newsOnStart', t.newsStart, null, () => this.cfg.newsOnStart !== false);

    // Appearance
    const look = section(t.lookSection);
    this.addChoice(look, 'scale', t.size, [
      [0.45, t.small], [0.6, t.medium], [0.8, t.large],
    ], () => this.cfg.scale);
    this.addChoice(look, 'theme', t.theme, [
      ['nightcity', t.neon], ['classic', t.classic],
    ], () => this.cfg.theme || 'nightcity');
    this.addChoice(look, 'motion', t.motion, [
      ['auto', t.motionAuto], ['full', t.motionFull], ['reduced', t.motionReduced],
    ], () => this.cfg.motion || 'auto', (motion) => this.host.setConfig({ motion, motionAsked: true }));
    this.addChoice(look, 'rest', t.rest, [
      ['corner', t.restCorner], ['taskbar', t.restTaskbar],
    ], () => this.cfg.rest || 'corner');
    this.addSwitch(look, 'muted', t.muted, null, () => Boolean(this.cfg.muted));

    // System
    const system = section(t.system);
    this.addChoice(system, 'lang', t.lang, LANGS.map(([code, name]) => [code, name || t.auto]),
      () => this.cfg.langSetting || 'auto');

    this.body.replaceChildren(...groups);

    // The shortcuts to everything a card this size can't hold.
    this.foot.replaceChildren(this.footButton(t.customize, () => this.customize()),
      this.footButton(t.model, () => this.model()),
      this.footButton(t.sounds, () => this.host.openSounds()),
      this.footButton(t.logs, () => this.host.openLogs()),
      this.footButton(t.menu, () => this.host.openMenu(), true));

    this.refresh();
  }

  addSwitch(parent, key, label, note, on, enabled = null, run = null) {
    const row = document.createElement('div');
    row.className = 'settings__row';
    row.dataset.key = key;

    const text = document.createElement('div');
    text.className = 'settings__text';
    const line = document.createElement('span');
    line.className = 'settings__label';
    line.textContent = label;
    text.append(line);
    if (note) {
      const sub = document.createElement('span');
      sub.className = 'settings__note';
      sub.textContent = note;
      text.append(sub);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings__switch';
    button.setAttribute('role', 'switch');
    const knob = document.createElement('span');
    knob.className = 'settings__knob';
    button.append(knob);
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const next = button.getAttribute('aria-checked') !== 'true';
      if (run) {
        run(next);
        return;
      }
      button.setAttribute('aria-checked', String(next)); // the answer is immediate, the save follows
      this.cfg = { ...this.cfg, [key]: next };
      this.refresh();
      this.host.setConfig({ [key]: next });
    });

    row.append(text, button);
    parent.append(row);
    this.controls.set(key, { kind: 'switch', on, enabled, button, row });
  }

  addChoice(parent, key, label, options, value, run = null) {
    const row = document.createElement('div');
    row.className = 'settings__row settings__row--choice';
    row.dataset.key = key;

    const text = document.createElement('span');
    text.className = 'settings__label';
    text.textContent = label;

    const seg = document.createElement('div');
    seg.className = 'settings__seg';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    const buttons = new Map();
    for (const [option, name] of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings__seg-btn';
      button.textContent = name;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (same(option, value())) return;
        for (const [, other] of buttons) other.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-pressed', 'true');
        this.cfg = { ...this.cfg, [key]: option };
        if (key === 'lang') this.renderedLang = null; // new labels once the config comes back
        this.refresh();
        if (run) run(option);
        else this.host.setConfig({ [key]: option });
      });
      buttons.set(option, button);
      seg.append(button);
    }

    row.append(text, seg);
    parent.append(row);
    this.controls.set(key, { kind: 'choice', value, buttons });
  }

  // A picker (the microphone): a native select, so it scrolls and reads like the system's own.
  addSelect(parent, key, label, options, value, enabled = null) {
    const row = document.createElement('div');
    row.className = 'settings__row settings__row--select';
    row.dataset.key = key;

    const text = document.createElement('span');
    text.className = 'settings__label';
    text.textContent = label;

    const select = document.createElement('select');
    select.className = 'settings__select';
    select.setAttribute('aria-label', label);
    const list = [...options];
    const current = value();
    // a name saved before this list (or a device now unplugged) still shows, not "Automatic"
    if (current && !list.some(([option]) => option === current)) list.push([current, current]);
    for (const [option, name] of list) {
      const item = document.createElement('option');
      item.value = option;
      item.textContent = name;
      select.append(item);
    }
    select.addEventListener('change', () => {
      const next = select.value;
      this.cfg = { ...this.cfg, [key]: next };
      this.refresh();
      this.host.setConfig({ [key]: next });
    });

    row.append(text, select);
    parent.append(row);
    this.controls.set(key, { kind: 'select', value, select, enabled, row });
  }

  footButton(label, run, primary = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = primary ? 'settings__action is-primary' : 'settings__action';
    button.textContent = label;
    button.addEventListener('click', () => {
      this.close();
      run();
    });
    return button;
  }

  // Put every control on the config as it is now (after a change from the tray
  // menu too), and dim what can't be turned on yet.
  refresh() {
    for (const [key, control] of this.controls) {
      if (control.kind === 'switch') {
        const off = Boolean(control.enabled) && !control.enabled();
        control.row.classList.toggle('is-off', off);
        control.button.disabled = off;
        control.button.setAttribute('aria-checked', String(Boolean(control.on())));
      } else if (control.kind === 'select') {
        const off = Boolean(control.enabled) && !control.enabled();
        control.row.classList.toggle('is-off', off);
        control.select.disabled = off;
        control.select.value = control.value() || '';
      } else {
        for (const [option, button] of control.buttons) {
          button.setAttribute('aria-pressed', String(same(option, control.value())));
        }
      }
    }
  }
}
