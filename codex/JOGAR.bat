@echo off
setlocal
cd /d "%~dp0"
title Blockcraft - Jogar

where node.exe >nul 2>nul
if errorlevel 1 goto :no_node
if not exist "dist\index.html" goto :no_build

echo.
echo Blockcraft - http://127.0.0.1:5173
echo A versao pronta nao precisa de npm, internet ou servicos externos.
echo Mantenha esta janela aberta. Ctrl+C encerra o servidor.
echo.
node.exe scripts\serve.mjs --open
if errorlevel 1 goto :server_failed
exit /b 0

:no_node
echo.
echo Node.js nao foi encontrado.
echo Instale Node.js 22.12 ou superior e abra este arquivo novamente.
pause
exit /b 1

:no_build
echo.
echo A pasta dist nao foi encontrada. Para desenvolver, execute INICIAR.bat.
echo Para gerar a versao pronta, execute no terminal desta pasta:
echo   npm.cmd install
echo   npm.cmd run build
echo Depois abra JOGAR.bat novamente.
pause
exit /b 1

:server_failed
echo.
echo Nao foi possivel iniciar o servidor. Leia a mensagem acima.
pause
exit /b 1
