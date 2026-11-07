// Ela puxa assunto sozinha de vez em quando: madrugada, sessão longa, muitas janelas, silêncio
// comprido ou uma memória viva. Cooldown generoso e nunca durante o chat, um guia ou uma fala
// dela. O menu › "Ela puxa assunto" desliga.

import { pick, fmt } from './util.js';

const CHECK = 45 * 1000;             // de quanto em quanto tempo ela olha se é hora
const FIRST = 4 * 60 * 1000;         // a primeira depois de alguns minutos
const GAP_MIN = 28 * 60 * 1000;      // entre uma e outra
const GAP_MAX = 55 * 60 * 1000;
const LONG_SESSION = 2.5 * 60 * 60 * 1000;
const IDLE = 12 * 60 * 1000;         // sem mexer no mouse
const MANY_WINDOWS = 7;
const MEMORY_GAP = 50 * 60 * 1000;   // uma lembrança no máximo a cada tanto

export class Spark {
  constructor({ panel, brain, speech, capri, chat, guide, active }) {
    this.panel = panel;
    this.brain = brain;
    this.speech = speech;
    this.capri = capri;
    this.chat = chat;
    this.guide = guide;
    this.active = active || (() => 0); // ms since the pointer last moved
    this.enabled = true;
    this.started = Date.now();
    this.next = 0;
    this.lastMemory = 0;
    this.timer = null;
  }

  get t() {
    return this.brain.t.spark || {};
  }

  start() {
    if (this.timer) return;
    this.next = Date.now() + FIRST;
    this.timer = setInterval(() => this.tick(), CHECK);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // what she could talk about right now: the most relevant first, but still a weighted pick
  reasons() {
    const t = this.t;
    const hour = new Date().getHours();
    const wins = this.capri?.windows?.wins?.length || 0;
    const idle = this.active();
    const night = hour >= 0 && hour < 5;
    const long = Date.now() - this.started > LONG_SESSION;
    const pool = [];
    if (night && t.night) pool.push({ key: 'night', face: 'look', weight: 4 });
    if (long && t.long) pool.push({ key: 'long', face: 'aside', weight: 3 });
    if (wins >= MANY_WINDOWS && t.many) pool.push({ key: 'many', face: 'smug', weight: 2 });
    if (idle > IDLE && t.idle) pool.push({ key: 'idle', face: 'curious', weight: 3 });
    if (this.memories().length && t.memory && Date.now() - this.lastMemory > MEMORY_GAP) {
      pool.push({ key: 'memory', face: 'look', weight: 3 });
    }
    if (t.muse) pool.push({ key: 'muse', face: 'laugh', weight: 1 });
    return pool;
  }

  tick() {
    if (!this.enabled || !this.t.muse) return;
    if (Date.now() < this.next) return;
    if (this.chat?.open || this.guide?.running || this.capri?.stowed) return;
    if (this.capri?.windows?.game) return; // a game in front: let them play
    if (this.speech?.listening || this.speech?.wakeListening) return;
    if (this.panel?.visible) return; // a panel already up: don't stack another

    const pool = this.reasons();
    if (!pool.length) return;
    const total = pool.reduce((sum, r) => sum + r.weight, 0);
    let roll = Math.random() * total;
    const reason = pool.find((r) => (roll -= r.weight) <= 0) || pool[0];
    const line = this.lineFor(reason.key);
    if (!line) return;

    this.next = Date.now() + GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    if (reason.key === 'memory') this.lastMemory = Date.now();
    this.capri?.wake?.();
    this.panel.say({ kind: 'info', face: reason.face, line, hold: 7000 });
    this.speech?.say(line);
  }

  lineFor(key) {
    const list = this.t[key];
    if (!Array.isArray(list) || !list.length) return null;
    if (key === 'memory') {
      const memory = pick(this.memories());
      return memory ? fmt(pick(list), { memory }) : null;
    }
    return pick(list);
  }

  // what she picked up in conversation, without the [dd/mm] she keeps for herself
  memories() {
    return (this.brain.custom?.memories || [])
      .map((m) => String(m).replace(/^\[\d{2}\/\d{2}\]\s*/, '').trim())
      .filter((m) => m.length >= 8 && m.length <= 160);
  }
}
