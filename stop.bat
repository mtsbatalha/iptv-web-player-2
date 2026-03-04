@echo off
setlocal enabledelayedexpansion

REM ===============================================================================
REM IPTV Web Player - Stop (Windows)
REM Para todos os processos Node.js relacionados ao projeto
REM ===============================================================================

echo.
echo ========================================
echo   IPTV Web Player - Stop
echo ========================================
echo.

set "FOUND=0"

REM Procurar processos na porta 3001 (backend)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo [INFO] Parando processo do backend (PID: %%a^)...
    taskkill /PID %%a /F >nul 2>nul
    if not errorlevel 1 (
        echo [OK] Backend parado
        set "FOUND=1"
    )
)

REM Procurar processos na porta 5173 (frontend dev)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo [INFO] Parando processo do frontend (PID: %%a^)...
    taskkill /PID %%a /F >nul 2>nul
    if not errorlevel 1 (
        echo [OK] Frontend parado
        set "FOUND=1"
    )
)

if "%FOUND%"=="0" (
    echo [INFO] Nenhum processo do IPTV Web Player encontrado rodando.
) else (
    echo.
    echo [OK] Todos os processos foram parados.
)

echo.
pause
