@echo off
setlocal enabledelayedexpansion

REM ===============================================================================
REM IPTV Web Player - Status (Windows)
REM Mostra o status detalhado da aplicacao
REM ===============================================================================

set "SCRIPT_DIR=%~dp0"

echo.
echo ========================================
echo   IPTV Web Player - Status
echo ========================================
echo.

REM === Status do Backend ===
echo [BACKEND - Porta 3001]
set "BACKEND_RUNNING=0"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    set "BACKEND_RUNNING=1"
    set "BACKEND_PID=%%a"
)

if "!BACKEND_RUNNING!"=="1" (
    echo   Status: RODANDO
    echo   PID: !BACKEND_PID!
    REM Mostrar uso de memoria
    for /f "tokens=5 delims= " %%m in ('tasklist /FI "PID eq !BACKEND_PID!" /FO LIST 2^>nul ^| findstr "Mem"') do (
        echo   Memoria: %%m
    )
) else (
    echo   Status: PARADO
)
echo.

REM === Status do Frontend Dev ===
echo [FRONTEND DEV - Porta 5173]
set "FRONTEND_RUNNING=0"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    set "FRONTEND_RUNNING=1"
    set "FRONTEND_PID=%%a"
)

if "!FRONTEND_RUNNING!"=="1" (
    echo   Status: RODANDO
    echo   PID: !FRONTEND_PID!
) else (
    echo   Status: PARADO
    if exist "%SCRIPT_DIR%client\dist" (
        echo   Build de producao: DISPONIVEL
    ) else (
        echo   Build de producao: NAO ENCONTRADO
    )
)
echo.

REM === Node.js ===
echo [NODE.JS]
where node >nul 2>nul
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('node --version') do echo   Versao: %%v
) else (
    echo   NAO INSTALADO
)
echo.

REM === Dependencias ===
echo [DEPENDENCIAS]
if exist "%SCRIPT_DIR%node_modules" (
    echo   Backend: Instaladas
) else (
    echo   Backend: NAO INSTALADAS
)
if exist "%SCRIPT_DIR%client\node_modules" (
    echo   Frontend: Instaladas
) else (
    echo   Frontend: NAO INSTALADAS
)
echo.

REM === Diretorios de Dados ===
echo [DIRETORIOS DE DADOS]
if exist "%SCRIPT_DIR%uploads" (
    echo   Uploads: Existe
) else (
    echo   Uploads: Nao encontrado
)
if exist "%SCRIPT_DIR%recordings" (
    echo   Recordings: Existe
) else (
    echo   Recordings: Nao encontrado
)
echo.

REM === Configuracao ===
echo [CONFIGURACAO]
if exist "%SCRIPT_DIR%.env" (
    echo   .env: Configurado
) else (
    echo   .env: NAO ENCONTRADO - copie .env.example para .env
)
echo.

REM === FFmpeg ===
echo [FFMPEG]
where ffmpeg >nul 2>nul
if not errorlevel 1 (
    for /f "tokens=3" %%v in ('ffmpeg -version 2^>^&1 ^| findstr "ffmpeg version"') do echo   Versao: %%v
) else (
    echo   NAO INSTALADO (necessario para DVR/gravacoes)
)
echo.

REM === URLs ===
echo [URLs]
echo   Backend API:  http://localhost:3001
echo   Frontend Dev: http://localhost:5173
echo   Health Check: http://localhost:3001/api/health
echo.

echo ========================================
echo   Comandos disponiveis:
echo     start.bat         Iniciar aplicacao
echo     start.bat --prod  Iniciar em producao
echo     stop.bat          Parar aplicacao
echo     restart.bat       Reiniciar aplicacao
echo     status.bat        Este status
echo ========================================
echo.

pause
