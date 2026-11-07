"""Configuração do motor local (voz + notícias) do Capri Assistente.

Este processo é iniciado escondido pelo Electron. Ele não abre janela:
só responde em 127.0.0.1 para o app principal.
"""

from pathlib import Path

PASTA_PROJETO = Path(__file__).resolve().parent

# ---------- voz: falar ----------
MOTOR_DE_VOZ = "edge"                    # "edge" (neural, internet) ou "windows" (offline)
VOZ_NEURAL = "pt-BR-ThalitaMultilingualNeural"  # vozes: pt-BR-ThalitaMultilingualNeural, pt-BR-FranciscaNeural, pt-BR-AntonioNeural, ...
VOZ_NEURAL_VELOCIDADE = "-5%"
VOZ_NEURAL_TOM = "+0Hz"
VELOCIDADE_VOZ = 175                     # voz do Windows (reserva)
VOLUME_VOZ = 100                         # voz do Windows (reserva)
VOZ_ESCOLHIDA = ""                       # nome de uma voz do Windows; vazio = automática

# ---------- voz: ouvir ----------
IDIOMA_RECONHECIMENTO = "pt-BR"
NIVEL_MINIMO_VOZ = 500                   # abaixo disso = silêncio
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
