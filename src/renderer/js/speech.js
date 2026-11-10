// Voz pt-BR do Capri Assistente: fala as respostas (motor local, edge-tts) e ouve o
// microfone. A escuta pode ficar contínua, acordando com a palavra "Daenarys".

export const TEXTOS = {
  pt: {
    newsTag: 'NOTÍCIAS', newsLine: 'Estas são as principais notícias de agora.',
    newsFail: 'Não consegui buscar as notícias agora.',
    silence: 'Não ouvi nada. Tente de novo.',
    busy: 'Ainda estou ouvindo o que você disse.',
    unclear: 'Não entendi o que você disse.',
    fail: 'Não consegui ouvir. Verifique o microfone e a internet.',
    off: 'A voz está desligada. Ligue em Ajustes rápidos, no meu menu.',
    offline: 'O motor de voz ainda não está pronto.',
    wake: 'Estou aqui, viajante. Pode falar.',
  },
  en: {
    newsTag: 'HEADLINES', newsLine: 'These are the top headlines right now.',
    newsFail: 'I could not fetch the news right now.',
    silence: 'I heard nothing. Try again.',
    busy: 'I am still listening to you.',
    unclear: 'I did not catch that.',
    fail: 'I could not listen. Check the microphone and the internet.',
    off: 'Voice is off. Turn it on in Quick settings, in my menu.',
    offline: 'The voice engine is not ready yet.',
    wake: 'I am here, traveler. Go ahead.',
  },
  es: {
    newsTag: 'NOTICIAS', newsLine: 'Estas son las principales noticias de ahora.',
    newsFail: 'No pude buscar las noticias ahora.',
    silence: 'No oí nada. Inténtalo de nuevo.',
    busy: 'Todavía te estoy escuchando.',
    unclear: 'No entendí lo que dijiste.',
    fail: 'No pude escuchar. Revisa el micrófono y la internet.',
    off: 'La voz está apagada. Actívala en Ajustes rápidos, en mi menú.',
    offline: 'El motor de voz aún no está listo.',
    wake: 'Aquí estoy, viajero. Habla.',
  },
  fr: {
    newsTag: 'INFOS', newsLine: 'Voici les principales infos du moment.',
    newsFail: 'Je n’ai pas pu chercher les infos.',
    silence: 'Je n’ai rien entendu. Réessaie.',
    busy: 'Je t’écoute encore.',
    unclear: 'Je n’ai pas compris ce que tu as dit.',
    fail: 'Je n’ai pas pu écouter. Vérifie le micro et internet.',
    off: 'La voix est coupée. Active-la dans Réglages rapides, dans mon menu.',
    offline: 'Le moteur de voix n’est pas encore prêt.',
    wake: 'Je suis là, voyageur. Vas-y.',
  },
  ru: {
    newsTag: 'НОВОСТИ', newsLine: 'Главные новости прямо сейчас.',
    newsFail: 'Не удалось получить новости.',
    silence: 'Я ничего не услышала. Попробуй ещё раз.',
    busy: 'Я всё ещё слушаю тебя.',
    unclear: 'Я не разобрала, что ты сказал.',
    fail: 'Не удалось послушать. Проверь микрофон и интернет.',
    off: 'Голос выключен. Включи его в разделе «Быстрые настройки» в моём меню.',
    offline: 'Голосовой движок ещё не готов.',
    wake: 'Я здесь, странник. Говори.',
  },
};

function limpar(texto) {
  return String(texto || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#`>]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// "Daenarys", "Daenerys", "Deneris", "Dany", "Dani", "Capri": o que o Google costuma
// devolver quando você chama por ela. A comparação ignora acentos e maiúsculas.
const PALAVRA_ATIVACAO = /^(?:d[aeiy]+n[ae]r[yi]s|dany|dani|capri)$/;

function semAcento(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function chamouPorEla(texto) {
  return semAcento(texto).split(' ').some((palavra) => PALAVRA_ATIVACAO.test(palavra));
}

// Tira a palavra de ativação e um "ei/oi/hey" antes dela, preservando os acentos do comando.
function comandoSemPalavra(texto) {
  const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  const limpas = palavras.map((p) => semAcento(p));
  const indice = limpas.findIndex((p) => PALAVRA_ATIVACAO.test(p));
  if (indice < 0) return String(texto || '').trim();
  const antes = indice > 0 && /^(?:ei|oi|ola|hey|ok)$/.test(limpas[indice - 1])
    ? palavras.slice(0, indice - 1)
    : palavras.slice(0, indice);
  return [...antes, ...palavras.slice(indice + 1)]
    .join(' ')
    .replace(/^[\s,.;:!?–—-]+/, '')
    .replace(/[\s,.;:!?–—-]+$/, '')
    .trim();
}

export class Speech {
  constructor({ host, panel, brain, capri, chat, guide }) {
    this.host = host;
    this.panel = panel;
    this.brain = brain;
    this.capri = capri;
    this.chat = chat;
    this.guide = guide;
    this.on = true;
    this.speakReplies = true;
    this.always = true;
    this.lang = 'pt';
    this.listening = false;
    this.wakeRunning = false;
    this.wakeListening = false;
    this.wakeGen = 0;
    this.newsBusy = false;
    this.quantidade = 5;
    // modo conversa: depois de falar, ela continua ouvindo por alguns segundos sem o nome dela
    this.follow = true;
    this.followMs = 12000;
    this.followUntil = 0;
  }

  get t() {
    return TEXTOS[this.lang] || TEXTOS.pt;
  }

  configure(cfg) {
    this.on = cfg.voice !== false;
    this.speakReplies = cfg.speakReplies !== false;
    this.always = cfg.alwaysListen !== false;
    this.follow = cfg.chatFollow !== false;
    this.lang = cfg.lang || this.lang;
    if (!this.on && this.listening) this.stop();
    if (!this.on || !this.always) this.followUntil = 0;
    this.syncWake();
  }

  // Fala um texto (se a voz e as respostas faladas estiverem ligadas). `force` fala mesmo com
  // "falar as respostas" desligado: as notícias pedidas na hora, por exemplo. `lang` troca a
  // voz desta fala: o boletim é em português mesmo com o app em outra língua.
  async say(texto, { force = false, lang = null } = {}) {
    if (!this.on || (!this.speakReplies && !force)) return;
    const limpo = limpar(texto);
    if (!limpo) return;
    // se ela vai falar, qualquer escuta em andamento para: microfone não ouve a própria voz
    if (this.wakeListening && this.host.stopListening) {
      await this.host.stopListening().catch(() => {});
      this.wakeListening = false;
    }
    const res = await this.host.speak(limpo, lang || this.lang);
    if (!res?.ok) console.warn('[voz] não consegui falar:', res?.error || 'motor indisponível');
    // ela acabou de falar no chat: abre a janela de conversa, para você responder sem o nome dela.
    // O motor só enfileira a fala, então espera o fim dela antes de abrir a janela.
    else if (this.follow && this.chat?.open && this.chat?.turn === 0) {
      await this.esperarSilencio(360); // a long answer can take a while; the window opens after it ends
      if (this.follow && this.chat?.open && this.chat?.turn === 0) {
        this.followUntil = Date.now() + this.followMs;
      }
    }
  }

  async stop() {
    this.listening = false;
    this.followUntil = 0;
    this.panel.setListening(false);
    await this.host.stopSpeaking().catch(() => {});
  }

  // ---------- escuta contínua (palavra de ativação) ----------

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Liga/desliga o loop conforme a voz e a opção "Ouvir sempre".
  syncWake() {
    const quer = this.on && this.always;
    if (quer && !this.wakeRunning) this.startWake();
    else if (!quer) this.stopWake();
  }

  startWake() {
    if (this.wakeRunning) return;
    const gen = ++this.wakeGen;
    this.wakeRunning = true;
    this.wakeLoop(gen).catch(async () => {
      this.wakeRunning = false;
      if (gen === this.wakeGen && this.on && this.always) {
        await this.sleep(2000);
        if (gen === this.wakeGen && this.on && this.always) this.startWake();
      }
    });
  }

  stopWake() {
    this.wakeGen += 1;
    if (this.wakeListening && this.host.stopListening) this.host.stopListening().catch(() => {});
    this.wakeRunning = false;
    this.wakeListening = false;
    this.followUntil = 0;
  }

  async wakeLoop(gen) {
    while (gen === this.wakeGen && this.on && this.always) {
      // não escuta enquanto ela fala, pensa ou está no meio de uma conversa
      if (this.listening || this.wakeListening || this.chat?.turn || this.chat?.busy || this.guide?.running) {
        await this.sleep(350);
        continue;
      }
      const falando = this.host.isSpeaking ? await this.host.isSpeaking().catch(() => false) : false;
      if (falando) {
        await this.sleep(400);
        continue;
      }

      this.wakeListening = true;
      let res = null;
      try {
        res = await this.host.listen(this.lang);
      } catch {
        res = null;
      }
      this.wakeListening = false;
      if (gen !== this.wakeGen) break;
      if (!res) {
        await this.sleep(2000);
        continue;
      }
      if (!res.ok) {
        // microfone ocupado/indisponível: não martela o motor; tenta de novo com calma
        if (res.motivo === 'ocupado') await this.sleep(600);
        else if (res.motivo === 'erro' || res.error) await this.sleep(4000);
        continue;
      }
      if (!res.texto) continue;

      const texto = String(res.texto);
      // with a shutdown counting down, "cancel the shutdown" works without her name
      const cancelando = Boolean(this.chat?.shutdown) && /cancel|abort|annule|отмен/i.test(texto);
      // modo conversa: ela falou há pouco, então esta fala é a continuação, sem o nome dela
      const seguindo = this.follow && Date.now() < this.followUntil && Boolean(this.chat?.open);
      const chamou = chamouPorEla(texto);
      if (!cancelando && !seguindo && !chamou) continue;
      if (seguindo) this.followUntil = 0;
      try {
        // chamada pelo nome: o comando vai sem ele; continuação: a frase inteira é a mensagem
        const comando = chamou ? comandoSemPalavra(texto) : texto;
        await this.acordar(comando, gen, { seguir: seguindo && !chamou });
      } catch {
        await this.sleep(1000);
      }
    }
    if (gen === this.wakeGen) this.wakeRunning = false;
  }

  // Ela ouviu o nome (ou você continuou a conversa): abre o chat e executa o comando (ou espera o resto).
  async acordar(comando, gen, { seguir = false } = {}) {
    await this.host.stopSpeaking().catch(() => {});
    if (!seguir) {
      this.voice?.play?.('star');
      this.capri?.perform?.('curious', this.capri.towardCenter?.());
    }
    this.capri?.wake?.();
    if (!this.chat.open) await this.chat.start({ quiet: true });
    if (!this.chat.open) return;
    if (comando) {
      this.chat.send(comando);
      return;
    }
    this.panel.say({ kind: 'info', face: 'look', line: this.t.wake, hold: 3500, voice: false });
    if (this.speakReplies) {
      await this.say(this.t.wake, { force: true });
      await this.esperarSilencio();
    }
    if (gen === this.wakeGen) await this.listen({ quiet: true });
  }

  async esperarSilencio(max = 80) {
    let comecou = false;
    for (let i = 0; i < max; i += 1) {
      const falando = this.host.isSpeaking ? await this.host.isSpeaking().catch(() => false) : false;
      if (falando) comecou = true;
      else if (comecou || i >= 6) return; // terminou, ou não havia nada para esperar
      await this.sleep(250);
    }
  }

  // O botão do microfone (ou Ctrl+Alt+J): abre o chat, ouve e manda o que você disse.
  async listen({ quiet = false } = {}) {
    if (this.listening) return;
    if (!this.on) {
      this.panel.say({ kind: 'info', face: 'aside', line: this.t.off, hold: 6000 });
      return;
    }

    // abre o chat sem falar a saudação e para o que estiver tocando: o microfone não pode
    // ouvir a própria voz dela (notícias, resposta anterior ou o "oi" de abertura)
    if (!this.chat.open) await this.chat.start({ quiet: true });
    if (!this.chat.open) return; // ela ainda está se preparando para conversar
    await this.host.stopSpeaking().catch(() => {});

    this.listening = true;
    if (this.wakeListening && this.host.stopListening) {
      await this.host.stopListening().catch(() => {});
      this.wakeListening = false;
    }
    this.panel.setListening(true);
    this.capri.perform?.('curious', this.capri.towardCenter?.());

    const res = await this.host.listen(this.lang).catch((err) => ({ ok: false, error: err.message }));
    this.listening = false;
    this.panel.setListening(false);
    if (!this.chat.open) return; // ela fechou o chat enquanto você falava

    if (res?.ok && res.texto) {
      this.chat.send(res.texto);
      return;
    }

    if (quiet) return;

    const motivo = res?.motivo;
    const mensagem = motivo === 'silencio' ? this.t.silence
      : motivo === 'ocupado' ? this.t.busy
        : motivo === 'incompreensivel' ? this.t.unclear
          : this.t.fail;
    if (res?.mensagem || res?.error) console.warn('[voz] escuta:', res.mensagem || res.error);
    this.panel.setFace('aside');
    this.panel.stream(mensagem, { done: true });
  }

  // Boletim de notícias: mostra no painel (quando dá) e fala em voz alta.
  async news({ assunto = null, quiet = false } = {}) {
    if (this.newsBusy) return;
    this.newsBusy = true;
    this.capri.wake?.();

    const res = await this.host.news({ assunto, quantidade: this.quantidade })
      .catch((err) => ({ ok: false, error: err.message }));
    this.newsBusy = false;

    if (!res?.ok) {
      if (!quiet) this.panel.say({ kind: 'error', face: 'aside', line: res?.error || this.t.newsFail, hold: 8000 });
      return;
    }

    this.host.markNews().catch(() => {});

    const podeMostrar = !quiet && !this.chat.open && !this.guide?.running;
    if (podeMostrar) {
      this.panel.say({
        kind: 'info',
        face: 'look',
        tag: this.t.newsTag,
        line: this.t.newsLine,
        reply: res.texto,
        hold: 18000,
      });
    }
    // pedido na hora (ou na abertura, com a voz ligada): fala sempre. O boletim é em português,
    // então a voz também, mesmo com o app em outra língua.
    await this.say(res.texto, { force: true, lang: 'pt' });
  }
}
