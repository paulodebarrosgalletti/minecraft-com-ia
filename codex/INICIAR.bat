@echo off
setlocal
cd /d "%~dp0"
title Blockcraft - Desenvolvimento

where node.exe >nul 2>nul
if errorlevel 1 goto :no_node
where npm.cmd >nul 2>nul
if errorlevel 1 goto :no_node

if exist "node_modules\vite\bin\vite.js" goto :start
echo Instalando as dependencias do projeto. Esta etapa precisa de internet.
call npm.cmd install
if errorlevel 1 goto :install_failed

:start
echo.
echo Blockcraft - http://127.0.0.1:5173
echo Mantenha esta janela aberta. Ctrl+C encerra o servidor.
echo Use sempre o mesmo endereco e navegador para acessar seus mundos salvos.
echo.
call npm.cmd run dev -- --open --strictPort
if errorlevel 1 goto :server_failed
exit /b 0

:no_node
echo.
echo Node.js e npm nao foram encontrados.
echo Instale Node.js 22.12 ou superior e abra este arquivo novamente.
pause
exit /b 1

:install_failed
echo.
echo Nao foi possivel instalar as dependencias. Confira a conexao e o erro acima.
pause
exit /b 1

:server_failed
echo.
echo O servidor foi encerrado ou nao conseguiu iniciar.
echo Se a porta 5173 estiver em uso, abra http://127.0.0.1:5173
echo ou encerre a outra instancia antes de tentar novamente.
pause
exit /b 1
