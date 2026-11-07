# Cria o ambiente Python do motor (voz + notícias)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$venv = Join-Path $here ".venv"

if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
    Write-Host "Criando o ambiente Python em engine\.venv ..."
    py -3 -m venv $venv
}

& (Join-Path $venv "Scripts\python.exe") -m pip install --upgrade pip
& (Join-Path $venv "Scripts\python.exe") -m pip install -r (Join-Path $here "requirements.txt")

Write-Host "Motor pronto: engine\.venv"
