"""Ouve o microfone e devolve o texto reconhecido (Google, pt-BR)."""

import math
import queue
import threading
from array import array

import sounddevice as sd
import speech_recognition as sr

import config

TAXA = 16000
LARGURA = 2
DURACAO_BLOCO = 0.1


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
        self._trava = threading.Lock()
        self._parar = threading.Event()
        self.ocupado = False

    def parar(self):
        """Interrompe uma escuta em andamento (para ela não ouvir a própria voz)."""
        self._parar.set()

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
            if audio is None:
                return ("silencio", "Não ouvi nada.")

            texto = self.motor.recognize_google(
                audio, language=config.IDIOMA_RECONHECIMENTO
            )
            return ("texto", texto)

        except sr.UnknownValueError:
            return ("incompreensivel", "Não consegui entender o que você disse.")
        except sr.RequestError:
            return ("erro", "Não consegui acessar o serviço de reconhecimento. Verifique a internet.")
        except Exception as erro:
            return ("erro", f"Problema com o microfone: {erro}")

    def _gravar(self):
        frames_por_bloco = int(TAXA * DURACAO_BLOCO)
        max_blocos = round(config.SEGUNDOS_MAXIMO_GRAVACAO / DURACAO_BLOCO)
        blocos_de_espera = round(config.SEGUNDOS_ESPERA_INICIO / DURACAO_BLOCO)
        blocos_de_silencio = round(config.SEGUNDOS_SILENCIO_PARA_PARAR / DURACAO_BLOCO)

        blocos = []
        falou = False
        silencio = 0

        with sd.RawInputStream(samplerate=TAXA, channels=1, dtype="int16") as fluxo:
            for numero in range(max_blocos):
                dados, _estouro = fluxo.read(frames_por_bloco)
                if self._parar.is_set():
                    return None
                bloco = bytes(dados)
                blocos.append(bloco)

                if medir_nivel(bloco) > config.NIVEL_MINIMO_VOZ:
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
