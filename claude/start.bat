@echo off
title Minecraft AI Recreation - BlockCraft
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org/ e tente novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias - somente na primeira vez...
  call npm install
)
echo Iniciando o jogo em http://localhost:5173 ...
call npm run dev
pause