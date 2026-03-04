@echo off
setlocal enabledelayedexpansion

REM ===============================================================================
REM IPTV Web Player - Start (Windows)
REM Inicia o backend e frontend em modo de desenvolvimento ou producao
REM ===============================================================================

set "SCRIPT_DIR=%~dp0"

echo.
echo ========================================
echo   IPTV Web Player - Start
echo ========================================
echo.

REM Verificar se Node.js esta instalado
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js nao encontrado. Instale o Node.js 18+
    pause
    exit /b 1
)

REM Verificar se as dependencias estao instaladas
if not exist "%SCRIPT_DIR%node_modules" (
    echo [INFO] Dependencias do servidor nao encontradas. Executando npm install...
    cd /d "%SCRIPT_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] Falha ao instalar dependencias do servidor
        pause
        exit /b 1
    )
)

if not exist "%SCRIPT_DIR%client\node_modules" (
    echo [INFO] Dependencias do cliente nao encontradas. Executando npm install...
    cd /d "%SCRIPT_DIR%client"
    call npm install
    if errorlevel 1 (
        echo [ERROR] Falha ao instalar dependencias do cliente
        pause
        exit /b 1
    )
)

cd /d "%SCRIPT_DIR%"

REM Verificar se ja esta rodando
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo [WARN] Porta 3001 ja esta em uso (PID: %%a^). O servidor pode ja estar rodando.
    echo Use stop.bat para parar antes de iniciar novamente.
    pause
    exit /b 0
)

REM Modo de execucao
if "%1"=="--prod" goto :production
if "%1"=="-p" goto :production

:development
echo [INFO] Iniciando em modo DESENVOLVIMENTO...
echo [INFO] Backend: http://localhost:3001
echo [INFO] Frontend: http://localhost:5173
echo.
echo Pressione Ctrl+C para parar.
echo.
call npm run dev
goto :end

:production
echo [INFO] Iniciando em modo PRODUCAO...
echo [INFO] Construindo frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Falha ao construir frontend
    pause
    exit /b 1
)
echo [INFO] Iniciando servidor...
echo [INFO] Aplicacao: http://localhost:3001
echo.
echo Pressione Ctrl+C para parar.
echo.
call npm start
goto :end

:end
pause
