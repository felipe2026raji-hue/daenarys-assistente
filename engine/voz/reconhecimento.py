"""Ouve o microfone e devolve o texto reconhecido (Google, pt-BR)."""

import math
import os
import queue
import subprocess
import threading
import traceback
from array import array

import sounddevice as sd
import speech_recognition as sr
import speech_recognition.audio as sr_audio

import config

TAXA = 16000
LARGURA = 2
DURACAO_BLOCO = 0.1


def _flac_sem_console(self, convert_rate=None, convert_width=None):
    """Converte o áudio para FLAC sem herdar o stderr do motor.

    No app empacotado o motor roda sem console e o Windows entrega um handle de
    stderr inválido; o ``subprocess`` do speech_recognition falhava com
    ``WinError 50`` antes mesmo de enviar o áudio ao Google. Passar
    ``stderr=DEVNULL`` evita o handle herdado.
    """
    wav = self.get_wav_data(convert_rate, convert_width)
    processo = subprocess.Popen(
        [sr_audio.get_flac_converter(), "--stdout", "--totally-silent", "--best", "-"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    dados, _ = processo.communicate(wav)
    return dados


sr_audio.AudioData.get_flac_data = _flac_sem_console

# Microfones virtuais/mudos que não devem ser escolhidos sozinhos.
_VIRTUAIS = (
    "voicemod", "dummy", "cable", "virtual", "vb-audio", "mapeador",
    "sound mapper", "driver de captura", "stereo mix", "what u hear",
    "mixagem estéreo", "loopback", "mixed capture",
)


def _nome_do_dispositivo(indice):
    try:
        return str(sd.query_devices(indice).get("name", ""))
    except Exception:
        return ""


def _virtual(nome):
    baixo = str(nome).lower()
    return any(palavra in baixo for palavra in _VIRTUAIS)


def listar_microfones():
    """Nomes das entradas físicas, sem repetir, na ordem do sistema.

    O app mostra esta lista nos ajustes, no menu da bandeja e no chat. O nome é
    o que fica salvo (o índice muda quando você pluga ou tira um aparelho).
    Fora ficam os virtuais e o WDM-KS, que não abre em 16 kHz (o formato da escuta).
    """
    vistos = set()
    nomes = []
    try:
        for indice, dispositivo in enumerate(sd.query_devices()):
            if dispositivo["max_input_channels"] <= 0:
                continue
            nome = str(dispositivo.get("name", "")).strip()
            chave = nome.casefold()
            if not nome or "()" in nome or _virtual(nome) or chave in vistos:
                continue
            try:
                api = str(sd.query_hostapis(dispositivo.get("hostapi"))["name"])
            except Exception:
                api = ""
            if "wdm-ks" in api.lower():
                continue
            vistos.add(chave)
            nomes.append(nome)
    except Exception as erro:
        print(f"[microfone] não consegui listar: {erro}", flush=True)
    return nomes


def _abre(indice):
    """Testa se o dispositivo entrega áudio em 16 kHz (o formato da escuta)."""
    try:
        with sd.RawInputStream(
            device=indice, samplerate=TAXA, channels=1, dtype="int16"
        ) as fluxo:
            fluxo.read(int(TAXA * 0.1))
        return True
    except Exception:
        return False


def resolver_dispositivo(escolhido):
    """Índice de um microfone pelo nome (ou número, para configs antigas)."""
    if escolhido in ("", None):
        return None
    if isinstance(escolhido, int):
        return escolhido
    texto = str(escolhido).strip()
    if not texto:
        return None
    if texto.isdigit():
        return int(texto)

    baixo = texto.casefold()
    exatos = []
    parecidos = []
    try:
        for indice, dispositivo in enumerate(sd.query_devices()):
            if dispositivo["max_input_channels"] <= 0:
                continue
            nome = str(dispositivo.get("name", ""))
            chave = nome.casefold()
            if chave == baixo:
                exatos.append(indice)
            elif baixo in chave:
                parecidos.append(indice)
    except Exception as erro:
        print(f"[microfone] não consegui procurar {texto!r}: {erro}", flush=True)
        return None

    candidatos = exatos + parecidos
    for indice in candidatos:
        if _abre(indice):
            return indice
    # nenhum abriu agora (talvez já esteja em uso): ainda assim tenta o primeiro
    return candidatos[0] if candidatos else None


def escolher_dispositivo(preferido=""):
    """Índice do microfone a usar, ou None para o padrão do Windows.

    Com um microfone escolhido (ajustes, bandeja ou chat), usa o nome salvo.
    Sem escolha, ignora Voicemod/Dummy/cabo virtual: se o padrão for um deles,
    testa as entradas físicas por um instante e fica com a que tiver mais sinal.
    Assim ela não grava silêncio de um microfone virtual.
    """
    escolhido = preferido or os.environ.get("CAPRI_MIC") or config.DISPOSITIVO_ENTRADA
    if escolhido not in ("", None):
        indice = resolver_dispositivo(escolhido)
        if indice is not None:
            print(f"[microfone] escolhido por você: {indice} {_nome_do_dispositivo(indice)}", flush=True)
            return indice
        print(f"[microfone] não achei {escolhido!r}; escolhendo sozinho", flush=True)
    try:
        padrao = sd.default.device[0]
        print(f"[microfone] padrão do Windows: {padrao} {_nome_do_dispositivo(padrao)}", flush=True)
        if isinstance(padrao, int) and padrao >= 0 and not _virtual(_nome_do_dispositivo(padrao)):
            try:
                with sd.RawInputStream(
                    device=padrao, samplerate=TAXA, channels=1, dtype="int16"
                ) as fluxo:
                    fluxo.read(int(TAXA * 0.35))
                print(f"[microfone] padrão utilizável: {padrao}", flush=True)
                return None
            except Exception as erro:
                print(f"[microfone] padrão falhou no teste: {erro}", flush=True)
        candidatos = _candidatos()
        melhor = None
        melhor_nivel = 0
        for indice in candidatos[:8]:
            try:
                with sd.RawInputStream(
                    device=indice, samplerate=TAXA, channels=1, dtype="int16"
                ) as fluxo:
                    dados, _estouro = fluxo.read(int(TAXA * 0.35))
                nivel = medir_nivel(bytes(dados))
            except Exception as erro:
                print(f"[microfone] {indice} falhou no teste: {erro}", flush=True)
                continue
            print(f"[microfone] {indice} {_nome_do_dispositivo(indice)}: nível {nivel:.1f}", flush=True)
            if nivel > melhor_nivel:
                melhor, melhor_nivel = indice, nivel
        print(f"[microfone] escolhido: {melhor} {_nome_do_dispositivo(melhor) if melhor is not None else 'padrão'}", flush=True)
        return melhor
    except Exception as erro:
        print(f"[microfone] não consegui escolher: {erro}", flush=True)
        return None


def _candidatos():
    """Entradas físicas (sem Voicemod/Dummy/cabo virtual), na ordem do sistema."""
    candidatos = []
    try:
        for indice, dispositivo in enumerate(sd.query_devices()):
            if dispositivo["max_input_channels"] > 0 and not _virtual(dispositivo["name"]):
                candidatos.append(indice)
    except Exception:
        pass
    return candidatos


def medir_nivel(bloco):
    amostras = array("h", bloco)
    if len(amostras) == 0:
        return 0
    soma_dos_quadrados = sum(a * a for a in amostras)
    return math.sqrt(soma_dos_quadrados / len(amostras))


class Reconhecedor:
    """Uma escuta por vez. `ouvir()` bloqueia até terminar e devolve (tipo, texto)."""

    def __init__(self):
        self.motor = sr.Recognizer()
        # sem isso, uma rede ruim deixa a escuta presa para sempre
        self.motor.operation_timeout = 15
        self._trava = threading.Lock()
        self._parar = threading.Event()
        self._preferido = os.environ.get("CAPRI_MIC") or config.DISPOSITIVO_ENTRADA
        self._dispositivo = None
        self._dispositivo_pronto = False
        self.ocupado = False

    def parar(self):
        """Interrompe uma escuta em andamento (para ela não ouvir a própria voz)."""
        self._parar.set()

    def microfones(self):
        """Nomes dos microfones que o app pode oferecer."""
        return listar_microfones()

    def escolhido(self):
        """O microfone em uso agora: {"indice", "nome"}; vazio = padrão do Windows."""
        if not self._dispositivo_pronto:
            return {"indice": None, "nome": ""}
        return {
            "indice": self._dispositivo,
            "nome": _nome_do_dispositivo(self._dispositivo) if self._dispositivo is not None else "",
        }

    def usar(self, preferido):
        """Troca o microfone sem reiniciar o motor (nome salvo; "" = automático)."""
        self._preferido = str(preferido or "")
        self._dispositivo = None
        self._dispositivo_pronto = False
        if self._preferido:
            indice = resolver_dispositivo(self._preferido)
            if indice is not None:
                self._dispositivo = indice
                self._dispositivo_pronto = True
                print(f"[microfone] usando {indice} {_nome_do_dispositivo(indice)}", flush=True)
        else:
            print("[microfone] automático de novo", flush=True)
        return self.escolhido()

    def _entrada(self):
        """Escolhe o microfone uma vez e lembra; None = padrão do Windows."""
        if not self._dispositivo_pronto:
            self._dispositivo = escolher_dispositivo(self._preferido)
            self._dispositivo_pronto = True
        return self._dispositivo

    def ouvir(self):
        if not self._trava.acquire(blocking=False):
            return ("ocupado", "Já estou ouvindo.")
        self.ocupado = True
        self._parar.clear()
        try:
            return self._trabalhar()
        finally:
            self.ocupado = False
            self._trava.release()

    def _trabalhar(self):
        try:
            audio = self._gravar()
        except Exception as erro:
            traceback.print_exc()
            return ("erro", f"Problema com o microfone: {erro}")
        if audio is None:
            return ("silencio", "Não ouvi nada.")

        try:
            texto = self.motor.recognize_google(
                audio, language=config.IDIOMA_RECONHECIMENTO
            )
            return ("texto", texto)
        except sr.UnknownValueError:
            return ("incompreensivel", "Não consegui entender o que você disse.")
        except sr.RequestError:
            return ("erro", "Não consegui acessar o serviço de reconhecimento. Verifique a internet.")
        except Exception as erro:
            traceback.print_exc()
            return ("erro", f"Problema no reconhecimento: {erro}")

    def _gravar(self):
        # o escolhido primeiro; depois as outras entradas físicas; o padrão por último
        tentativas = []
        escolhido = self._entrada()
        if escolhido is not None:
            tentativas.append(escolhido)
        tentativas.extend(indice for indice in _candidatos() if indice not in tentativas)
        tentativas.append(None)

        ultimo_erro = None
        for dispositivo in tentativas:
            try:
                audio = self._gravar_de(dispositivo)
                if dispositivo != self._dispositivo:
                    self._dispositivo = dispositivo
                    self._dispositivo_pronto = True
                    nome = _nome_do_dispositivo(dispositivo) if dispositivo is not None else "padrão"
                    print(f"[microfone] usando {dispositivo} {nome}", flush=True)
                return audio
            except Exception as erro:
                print(f"[microfone] {dispositivo} falhou: {erro}", flush=True)
                ultimo_erro = erro
                continue
        raise ultimo_erro or RuntimeError("nenhum microfone disponível")

    def _gravar_de(self, dispositivo):
        frames_por_bloco = int(TAXA * DURACAO_BLOCO)
        max_blocos = round(config.SEGUNDOS_MAXIMO_GRAVACAO / DURACAO_BLOCO)
        blocos_de_espera = round(config.SEGUNDOS_ESPERA_INICIO / DURACAO_BLOCO)
        blocos_de_silencio = round(config.SEGUNDOS_SILENCIO_PARA_PARAR / DURACAO_BLOCO)

        blocos = []
        falou = False
        silencio = 0
        limiar = config.NIVEL_MINIMO_VOZ
        iniciais = []

        with sd.RawInputStream(device=dispositivo, samplerate=TAXA, channels=1, dtype="int16") as fluxo:
            for numero in range(max_blocos):
                dados, _estouro = fluxo.read(frames_por_bloco)
                if self._parar.is_set():
                    return None
                bloco = bytes(dados)
                blocos.append(bloco)

                nivel = medir_nivel(bloco)
                if numero < 5:
                    # piso adaptativo: o momento mais quieto dos primeiros 0,5 s
                    iniciais.append(nivel)
                    if len(iniciais) == 5:
                        limiar = max(config.NIVEL_MINIMO_VOZ, min(iniciais) * 1.5)

                if nivel > limiar:
                    falou = True
                    silencio = 0
                elif falou:
                    silencio += 1
                    if silencio >= blocos_de_silencio:
                        break
                elif numero >= blocos_de_espera:
                    return None

        if not falou:
            return None
        return sr.AudioData(b"".join(blocos), TAXA, LARGURA)
