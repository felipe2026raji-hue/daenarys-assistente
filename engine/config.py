"""Configuração do motor local (voz + notícias) do Capri Assistente.

Este processo é iniciado escondido pelo Electron. Ele não abre janela:
só responde em 127.0.0.1 para o app principal.
"""

from pathlib import Path

PASTA_PROJETO = Path(__file__).resolve().parent

# ---------- voz: falar ----------
MOTOR_DE_VOZ = "edge"                    # "edge" (neural, internet) ou "windows" (offline)
VOZ_NEURAL = "pt-BR-ThalitaMultilingualNeural"  # reserva quando o idioma não está em IDIOMAS
VOZ_NEURAL_VELOCIDADE = "-5%"
VOZ_NEURAL_TOM = "+0Hz"
VELOCIDADE_VOZ = 175                     # voz do Windows (reserva)
VOLUME_VOZ = 100                         # voz do Windows (reserva)
VOZ_ESCOLHIDA = ""                       # nome de uma voz do Windows; vazio = automática

# ---------- voz: ouvir ----------
IDIOMA_RECONHECIMENTO = "pt-BR"

# O app fala cinco línguas: o idioma escolhido chega em cada pedido (/falar e /ouvir) e
# aqui vira o código da escuta, a voz neural e a cultura da voz do Windows.
IDIOMAS = {
    "pt": {
        "reconhecimento": "pt-BR",
        "voz": "pt-BR-ThalitaMultilingualNeural",
        "cultura": "pt-BR",
    },
    "en": {
        "reconhecimento": "en-US",
        "voz": "en-US-AriaNeural",
        "cultura": "en-US",
    },
    "es": {
        "reconhecimento": "es-ES",
        "voz": "es-ES-ElviraNeural",
        "cultura": "es-ES",
    },
    "fr": {
        "reconhecimento": "fr-FR",
        "voz": "fr-FR-DeniseNeural",
        "cultura": "fr-FR",
    },
    "ru": {
        "reconhecimento": "ru-RU",
        "voz": "ru-RU-SvetlanaNeural",
        "cultura": "ru-RU",
    },
}
IDIOMA_PADRAO = "pt"


def idioma(codigo=None):
    """A ficha do idioma pedido: 'fr', 'pt-BR' e 'pt_BR' levam ao mesmo lugar.

    Um código fora dos cinco (ou vazio) cai no padrão, para a voz nunca ficar muda.
    """
    chave = str(codigo or "").strip().lower().replace("_", "-").split("-")[0]
    return IDIOMAS.get(chave, IDIOMAS[IDIOMA_PADRAO])


# Microfone de entrada: "" escolhe sozinho (ignora Voicemod, Dummy, cabo virtual...),
# um número usa o dispositivo do sounddevice (veja `python -m sounddevice`),
# ou um pedaço do nome, por exemplo "High Definition".
DISPOSITIVO_ENTRADA = ""
NIVEL_MINIMO_VOZ = 100                  # piso; o motor sobe sozinho se o ambiente for barulhento
SEGUNDOS_SILENCIO_PARA_PARAR = 1.5       # silêncio que indica que você terminou
SEGUNDOS_ESPERA_INICIO = 6               # quanto esperar você começar a falar
SEGUNDOS_MAXIMO_GRAVACAO = 15            # limite de duração da gravação

# ---------- notícias ----------
NOTICIAS_QUANTIDADE = 5
NOTICIAS_FEEDS = [
    ("Google Notícias", "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419"),
    ("Agência Brasil", "https://agenciabrasil.ebc.com.br/feed/ultimasnoticias/feed.xml"),
    ("BBC Brasil", "https://feeds.bbci.co.uk/portuguese/rss.xml"),
]
