@echo off
setlocal enabledelayedexpansion

REM ===============================================================================
REM IPTV Web Player - Restart (Windows)
REM Para e reinicia a aplicacao
REM ===============================================================================

set "SCRIPT_DIR=%~dp0"

echo.
echo ========================================
echo   IPTV Web Player - Restart
echo ========================================
echo.

echo [INFO] Parando processos...
call "%SCRIPT_DIR%stop.bat" >nul 2>nul

REM Aguardar processos encerrarem
timeout /t 2 /nobreak >nul

echo [INFO] Reiniciando aplicacao...
call "%SCRIPT_DIR%start.bat" %*
