@echo off
setlocal enabledelayedexpansion

REM ===============================================================================
REM IPTV Web Player - Rebuild Frontend (Windows)
REM Forces a complete rebuild of the frontend
REM ===============================================================================

echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║              IPTV Web Player - Rebuild Frontend                  ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.

set "SCRIPT_DIR=%~dp0"
set "CLIENT_DIR=%SCRIPT_DIR%client"

REM Check if client directory exists
if not exist "%CLIENT_DIR%" (
    echo [ERROR] Client directory not found: %CLIENT_DIR%
    exit /b 1
)

cd /d "%CLIENT_DIR%"

REM Check for full clean option
set "FULL_CLEAN=0"
if "%1"=="--full" set "FULL_CLEAN=1"
if "%1"=="-f" set "FULL_CLEAN=1"

if "%FULL_CLEAN%"=="1" (
    echo [INFO] Full clean mode - removing node_modules...
    if exist "node_modules" rmdir /s /q node_modules
    if exist ".vite" rmdir /s /q .vite
    if exist "package-lock.json" del /f package-lock.json
)

REM Always clean dist and cache
echo [INFO] Cleaning build artifacts...
if exist "dist" rmdir /s /q dist
if exist ".vite" rmdir /s /q .vite

REM Clear npm cache
echo [INFO] Clearing npm cache...
call npm cache clean --force 2>nul

if "%FULL_CLEAN%"=="1" (
    echo [INFO] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies!
        exit /b 1
    )
)

REM Rebuild
echo [INFO] Building frontend...
call npm run build

if errorlevel 1 (
    echo [ERROR] Build failed!
    exit /b 1
)

echo.
echo [SUCCESS] Frontend rebuilt successfully!
echo.

REM Show build stats
if exist "dist" (
    echo Build completed. Check the dist folder for output.
)

echo.
echo To apply changes:
echo   - Development: restart 'npm run dev' in client folder
echo   - Production: restart the service
echo.

pause
