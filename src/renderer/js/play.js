// Brincadeiras de fantasia: pedra-papel-tesoura, tarô do cometa e adivinha o número.
// chat.js chama `play.take(texto)` antes de pedir a resposta à IA: se for brincadeira, ela
// responde na hora, sem gastar modelo e sem esperar.

import { pick, fmt } from './util.js';

// o jogo só começa quando o pedido é claramente o jogo (duas opções, ou o nome dele)
const RPS_START = /(?:pedra|papel|tesoura).*(?:pedra|papel|tesoura)|jokenp[oô]|joquempo|rock\s*[,/-]?\s*paper|paper\s*[,/-]?\s*scissors|pierre\s*[,/-]?\s*feuille|piedra\s*[,/-]?\s*tijera|камень.*(?:ножниц|бумаг)|ножниц.*(?:камень|бумаг)/i;
const RPS_WORDS = {
  rock: /\b(?:pedra|rock|pierre|piedra|камень)\b/i,
  paper: /\b(?:papel|paper|feuille|бумага)\b/i,
  scissors: /\b(?:tesoura|scissors|ciseaux|tijera|ножниц\w*)\b/i,
};
const TAROT = /tar[oô]|таро/i;
const GUESS = /(?:adivinha|adivinh|guess|devine|adivina|угадай).{0,24}(?:n[úu]mero|number|nombre|num[eé]ro|число)|(?:pensei|i picked|pens[eé]|я загадал).{0,24}(?:n[úu]mero|number|nombre|num[eé]ro|число)/i;

function choiceOf(text) {
  const found = Object.keys(RPS_WORDS).filter((key) => RPS_WORDS[key].test(text));
  return found.length === 1 ? found[0] : null;
}

export class Play {
  constructor({ chat, panel, brain, capri }) {
    this.chat = chat;
    this.panel = panel;
    this.brain = brain;
    this.capri = capri;
    this.guessN = null; // number she picked, while a game is on
  }

  get t() {
    return this.brain.t.play || {};
  }

  // true when she took the message as a game (chat.send then stops there)
  take(texto) {
    const t = this.t;
    if (!t.rpsAsk) return false;
    const text = String(texto || '').trim();
    const lower = text.toLowerCase();

    // a guess in progress: only a number between 1 and 10 counts; anything else ends the game
    if (this.guessN !== null) {
      const n = Number((lower.match(/\b(\d{1,2})\b/) || [])[1]);
      if (n >= 1 && n <= 10) {
        this.guess(n);
        return true;
      }
      this.guessN = null;
    }

    if (RPS_START.test(lower)) {
      const choice = choiceOf(lower);
      if (choice) this.rps(choice);
      else this.rpsAsk();
      return true;
    }
    if (TAROT.test(lower)) {
      this.tarot();
      return true;
    }
    if (GUESS.test(lower)) {
      this.guessStart();
      return true;
    }
    return false;
  }

  // her line in the chat, with her buttons when there are any
  say(line, face = 'smug', actions = null, onAction = null) {
    if (!line || !this.chat.open || this.chat.turn) return false;
    this.capri?.pulse?.();
    const ok = this.chat.interject(line, actions || [], onAction);
    if (ok) this.panel.setFace(face);
    return ok;
  }

  rpsAsk() {
    const t = this.t;
    this.say(t.rpsAsk, 'curious', [
      { id: 'rock', label: t.rpsRock },
      { id: 'paper', label: t.rpsPaper },
      { id: 'scissors', label: t.rpsScissors },
    ], (choice) => this.rps(choice));
  }

  rps(choice) {
    const t = this.t;
    if (!t[choice]) return;
    this.panel.setActions([]);
    const mine = pick(['rock', 'paper', 'scissors']);
    const win = (choice === 'rock' && mine === 'scissors')
      || (choice === 'paper' && mine === 'rock')
      || (choice === 'scissors' && mine === 'paper');
    const tie = choice === mine;
    const key = tie ? 'rpsTie' : win ? 'rpsWin' : 'rpsLose';
    const line = fmt(t[key], { mine: t[mine], theirs: t[choice] });
    this.say(line, tie ? 'smug' : win ? 'laugh' : 'aside');
  }

  tarot() {
    const t = this.t;
    const cards = t.tarot || [];
    if (!cards.length) return;
    const card = pick(cards);
    this.say(fmt(t.tarotLine, card), 'look');
  }

  guessStart() {
    if (!this.t.guessAsk) return;
    this.guessN = 1 + Math.floor(Math.random() * 10);
    this.say(this.t.guessAsk, 'smug');
  }

  guess(n) {
    const t = this.t;
    if (n === this.guessN) {
      this.guessN = null;
      this.say(fmt(t.guessWin, { n }), 'laugh');
      return;
    }
    this.say(n > this.guessN ? t.guessHigh : t.guessLow, 'smug');
  }
}
