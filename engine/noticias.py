"""Busca manchetes nos feeds RSS e monta um boletim falado curto."""

import re
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import config

USER_AGENT = "Mozilla/5.0 (CapriAssistente)"
ORDINAIS = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta", "Sexta"]
URL_BUSCA_GOOGLE = (
    "https://news.google.com/rss/search?q={consulta}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
)


def _normalizar(texto):
    texto = texto.lower()
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    texto = re.sub(r"[^a-z0-9 ]", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def _baixar(url):
    pedido = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(pedido, timeout=10) as resposta:
        return resposta.read()


def _ler_feed(nome, url):
    raiz = ET.fromstring(_baixar(url))
    e_google = "news.google.com" in url

    itens = []
    for item in raiz.iter("item"):
        titulo = (item.findtext("title") or "").strip()
        if not titulo:
            continue

        fonte = (item.findtext("source") or "").strip()

        if e_google and " - " in titulo:
            inicio, _, fim = titulo.rpartition(" - ")
            titulo = inicio.strip()
            fonte = fonte or fim.strip()

        itens.append((titulo, fonte or nome))
    return itens


def buscar_manchetes(assunto=None, quantidade=None):
    quantidade = quantidade or getattr(config, "NOTICIAS_QUANTIDADE", 5)

    if assunto:
        url = URL_BUSCA_GOOGLE.format(consulta=urllib.parse.quote(assunto))
        feeds = [("Google Notícias", url)]
    else:
        feeds = list(getattr(config, "NOTICIAS_FEEDS", []))

    listas = []
    for nome, url in feeds:
        try:
            listas.append(_ler_feed(nome, url))
        except Exception as erro:
            print(f"[noticias] Falha ao ler {nome}: {erro}", flush=True)

    manchetes = []
    vistos = set()
    posicao = 0
    while len(manchetes) < quantidade and any(posicao < len(lista) for lista in listas):
        for lista in listas:
            if posicao < len(lista) and len(manchetes) < quantidade:
                titulo, fonte = lista[posicao]
                chave = _normalizar(titulo)[:50]
                if chave not in vistos:
                    vistos.add(chave)
                    manchetes.append({"titulo": titulo, "fonte": fonte})
        posicao += 1
    return manchetes


def montar_boletim(manchetes, assunto=None):
    if assunto:
        partes = [f"Estas são as principais notícias sobre {assunto}."]
    else:
        partes = ["Estas são as principais notícias de agora."]

    for numero, manchete in enumerate(manchetes):
        ordinal = ORDINAIS[numero] if numero < len(ORDINAIS) else f"Número {numero + 1}"
        titulo = manchete["titulo"].rstrip(".!?;: ")
        partes.append(f"{ordinal}: {titulo}, segundo {manchete['fonte']}.")

    return " ".join(partes)
