"""Fala em voz alta: edge-tts (neural) com a voz do Windows como reserva."""

import asyncio
import base64
import os
import queue
import subprocess
import tempfile
import threading
import time

import config

SEM_JANELA = subprocess.CREATE_NO_WINDOW

SCRIPT_VOZ_WINDOWS = "; ".join([
    "Add-Type -AssemblyName System.Speech",
    "$voz = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$ok = $false",
    "if ($env:NOME_VOZ) { try { $voz.SelectVoice($env:NOME_VOZ); $ok = $true } catch { [Console]::Error.WriteLine('Voz nao encontrada: ' + $env:NOME_VOZ) } }",
    "if (-not $ok -and $env:IDIOMA_VOZ) { $exata = $voz.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq $env:IDIOMA_VOZ } | Select-Object -First 1; if ($exata) { $voz.SelectVoice($exata.VoiceInfo.Name); $ok = $true } }",
    "if (-not $ok -and $env:IDIOMA_VOZ) { $prefixo = $env:IDIOMA_VOZ.Substring(0,2); $parecida = $voz.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like ($prefixo + '-*') } | Select-Object -First 1; if ($parecida) { $voz.SelectVoice($parecida.VoiceInfo.Name); $ok = $true } }",
    "if (-not $ok -and $env:IDIOMA_VOZ) { [Console]::Error.WriteLine('Nenhuma voz do Windows para ' + $env:IDIOMA_VOZ + '; usando a padrao') }",
    "$voz.Rate = [int]$env:TAXA_FALA",
    "$voz.Volume = [int]$env:VOLUME_FALA",
    "$voz.Speak($env:TEXTO_FALA)",
])

SCRIPT_TOCAR_AUDIO = r"""
Add-Type -AssemblyName presentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([uri]$env:ARQUIVO_AUDIO)
$player.Play()
$tentativas = 0
while (-not $player.NaturalDuration.HasTimeSpan -and $tentativas -lt 50) {
    Start-Sleep -Milliseconds 100
    $tentativas++
}
if ($player.NaturalDuration.HasTimeSpan) {
    Start-Sleep -Milliseconds ([int]$player.NaturalDuration.TimeSpan.TotalMilliseconds + 300)
}
$player.Close()
"""


def limpar_para_fala(texto):
    texto = texto.replace("ex.:", "por exemplo:")
    for simbolo in "*#_`":
        texto = texto.replace(simbolo, "")
    return texto.strip()


class Sintetizador:
    def __init__(self):
        self.fila = queue.Queue()
        self._avisos_dados = set()
        self._edge_pausado_ate = 0.0
        self._trava = threading.Lock()
        self._trava_processo = threading.Lock()
        self._processo_atual = None
        self._pendentes = 0
        self._geracao = 0
        self.thread = threading.Thread(target=self._trabalhar, daemon=True)
        self.thread.start()

    # Roda um script do PowerShell guardando o processo: assim `parar()` consegue
    # interromper o áudio que já está tocando, não só o que ainda está na fila.
    def _powershell(self, script, ambiente, timeout=120, geracao=None):
        codificado = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
        processo = subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-NonInteractive",
             "-EncodedCommand", codificado],
            env=ambiente,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=SEM_JANELA,
        )
        with self._trava_processo:
            self._processo_atual = processo
        if geracao is not None and geracao != self._geracao:
            processo.kill()  # pediram para parar enquanto o processo nascia
        try:
            saida, erro = processo.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            processo.kill()
            saida, erro = processo.communicate()
        finally:
            with self._trava_processo:
                if self._processo_atual is processo:
                    self._processo_atual = None
        return processo.returncode, saida, erro

    def falar(self, texto, idioma=None):
        with self._trava:
            self._pendentes += 1
        self.fila.put((self._geracao, texto, idioma))

    def falando(self):
        with self._trava:
            return self._pendentes > 0

    def parar(self):
        """Descarta a fila e interrompe a fala que estiver tocando agora."""
        with self._trava:
            self._geracao += 1
            self._pendentes = 0
        while True:
            try:
                self.fila.get_nowait()
            except queue.Empty:
                break
        with self._trava_processo:
            processo = self._processo_atual
            self._processo_atual = None
        if processo and processo.poll() is None:
            try:
                processo.kill()
            except OSError:
                pass

    def _trabalhar(self):
        while True:
            geracao, texto, idioma = self.fila.get()
            try:
                if geracao == self._geracao:
                    self._falar_agora(texto, geracao, idioma)
            finally:
                with self._trava:
                    self._pendentes = max(0, self._pendentes - 1)

    def _avisar(self, mensagem):
        if mensagem not in self._avisos_dados:
            self._avisos_dados.add(mensagem)
            print(f"[voz] {mensagem}", flush=True)

    def _falar_agora(self, texto, geracao, idioma=None):
        texto = limpar_para_fala(texto)
        if not texto:
            return

        ficha = config.idioma(idioma)
        motor = getattr(config, "MOTOR_DE_VOZ", "edge")
        if motor == "edge" and time.time() >= self._edge_pausado_ate:
            if self._falar_com_voz_neural(texto, geracao, ficha):
                return
            if geracao != self._geracao:
                return  # pediram para parar: não repete pela voz do Windows
            self._edge_pausado_ate = time.time() + 60

        if geracao == self._geracao:
            self._falar_com_voz_do_windows(texto, geracao, ficha)

    # ---------- voz neural (edge-tts) ----------

    async def _gerar_audio(self, edge_tts, texto, caminho, voz):
        comunicador = edge_tts.Communicate(
            texto,
            voz or getattr(config, "VOZ_NEURAL", "pt-BR-AntonioNeural"),
            rate=getattr(config, "VOZ_NEURAL_VELOCIDADE", "+0%"),
            pitch=getattr(config, "VOZ_NEURAL_TOM", "+0Hz"),
        )
        await asyncio.wait_for(comunicador.save(caminho), timeout=30)

    def _falar_com_voz_neural(self, texto, geracao, ficha):
        try:
            import edge_tts
        except ImportError:
            self._avisar("A biblioteca edge-tts não está instalada. Usando a voz do Windows.")
            return False

        caminho = os.path.join(tempfile.gettempdir(), f"capri_engine_{os.getpid()}.mp3")
        try:
            asyncio.run(self._gerar_audio(edge_tts, texto, caminho, ficha.get("voz")))

            ambiente = os.environ.copy()
            ambiente["ARQUIVO_AUDIO"] = caminho
            codigo, _saida, erro_saida = self._powershell(SCRIPT_TOCAR_AUDIO, ambiente, geracao=geracao)
            if codigo != 0:
                if geracao != self._geracao:
                    return True  # foi interrompido de propósito, não é falha
                detalhe = erro_saida.strip()[:150] or "falha ao tocar o áudio"
                raise RuntimeError(detalhe)
            return True

        except Exception as erro:
            self._avisar(f"Voz neural indisponível ({erro}). Usando a voz do Windows.")
            return False
        finally:
            try:
                os.remove(caminho)
            except OSError:
                pass

    # ---------- voz do Windows (reserva) ----------

    def _falar_com_voz_do_windows(self, texto, geracao, ficha):
        velocidade = getattr(config, "VELOCIDADE_VOZ", 175)
        volume = getattr(config, "VOLUME_VOZ", 100)
        nome_voz = getattr(config, "VOZ_ESCOLHIDA", "")

        taxa = max(-10, min(10, (velocidade - 175) // 10))
        volume = max(0, min(100, volume))

        ambiente = os.environ.copy()
        ambiente["TEXTO_FALA"] = texto
        ambiente["TAXA_FALA"] = str(taxa)
        ambiente["VOLUME_FALA"] = str(volume)
        ambiente["NOME_VOZ"] = nome_voz
        ambiente["IDIOMA_VOZ"] = ficha.get("cultura", "")

        try:
            _codigo, _saida, erro_saida = self._powershell(SCRIPT_VOZ_WINDOWS, ambiente, geracao=geracao)
            erro = erro_saida.strip()
            if erro and geracao == self._geracao:
                self._avisar(erro)
        except Exception as erro:
            if geracao == self._geracao:
                self._avisar(f"Erro ao falar: {erro}")
