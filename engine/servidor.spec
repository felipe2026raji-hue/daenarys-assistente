# -*- mode: python ; coding: utf-8 -*-
# Motor da Daenarys em um executável (PyInstaller): voz + notícias, sem exigir
# Python no PC de quem instala. Gerado por `npm run engine:build`; a saída fica
# em engine/dist/servidor/servidor.exe e o app empacotado sobe esse .exe.

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = [], [], []

# Pacotes que carregam arquivos/dados próprios (o portaudio do sounddevice,
# as tabelas do edge-tts, os binários auxiliares do SpeechRecognition).
for package in ('edge_tts', 'sounddevice', 'speech_recognition'):
    d, b, h = collect_all(package)
    datas += d
    binaries += b
    hiddenimports += h

# No Python 3.13+ o audioop saiu da biblioteca padrão; o pacote audioop-lts
# devolve o módulo, mas o PyInstaller precisa ser avisado.
hiddenimports += ['audioop']

a = Analysis(
    ['servidor.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'pandas'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='servidor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # o Electron lê a porta em PORTA=... no stdout
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='servidor',
)
