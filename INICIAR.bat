@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Daenarys Assistente - iniciando
echo ==========================================

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado. Instale em https://nodejs.org e abra este arquivo de novo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Instalando dependencias do app...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Falha no npm install.
    pause
    exit /b 1
  )
)

if not exist "engine\.venv\Scripts\python.exe" (
  echo Preparando o motor de voz...
  call npm run engine:setup
  if errorlevel 1 (
    echo Falha ao preparar o motor de voz. Verifique se o Python 3 esta instalado.
    pause
    exit /b 1
  )
)

echo Abrindo a Daenarys Assistente...
call npm start
if errorlevel 1 (
  echo.
  echo O app terminou com erro.
  pause
)
endlocal
