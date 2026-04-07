@echo off
setlocal enabledelayedexpansion
title LocalDev AI - One-Click Setup
color 0B

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
cd /d "%ROOT_DIR%"

echo.
echo  ========================================
echo   LocalDev AI - First-Time Setup
echo  ========================================
echo.

:: Create directories
echo [1/6] Creating directories...
for %%D in (config logs models\gguf models\ollama bin\ollama bin\llama bin\node) do (
    if not exist "%%D" mkdir "%%D" 2>nul
)
echo       [OK] Directory structure ready

:: Create default config if missing
echo [2/6] Checking config...
if not exist "config\settings.json" (
    echo       [*] Creating default config...
    (
        echo {
        echo   "ollama_path": "./bin/ollama",
        echo   "llama_path": "./bin/llama",
        echo   "model_path": "./models",
        echo   "log_path": "./logs",
        echo   "auto_start_ollama": true,
        echo   "default_model": "llama3.2",
        echo   "ollama_port": 11434,
        echo   "llama_port": 8081,
        echo   "app_port": 8080
        echo }
    ) > "config\settings.json"
)
echo       [OK] Config ready

:: Check Node.js
echo [3/6] Checking Node.js...
set "NODE_CMD="

:: Check portable node first
if exist "bin\node\node.exe" (
    set "NODE_CMD=%ROOT_DIR%\bin\node\node.exe"
    set "PATH=%ROOT_DIR%\bin\node;%PATH%"
    echo       [OK] Using portable Node.js
    goto :node_ready
)

:: Check system node
where node >nul 2>&1
if not errorlevel 1 (
    set "NODE_CMD=node"
    echo       [OK] Using system Node.js
    goto :node_ready
)

:: Try install via winget
echo       [!] Node.js not found - installing...
where winget >nul 2>&1
if not errorlevel 1 (
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    where node >nul 2>&1
    if not errorlevel 1 (
        set "NODE_CMD=node"
        echo       [OK] Node.js installed!
        goto :node_ready
    )
)

echo       [ERROR] Could not install Node.js. Download from https://nodejs.org
echo       Or place portable node.exe in bin\node\
pause
exit /b 1

:node_ready
for /f "tokens=*" %%i in ('node --version 2^>nul') do echo       Version: %%i

:: Install dependencies
echo [4/6] Installing npm packages...
if not exist "node_modules" (
    call npm install
    if errorlevel 1 (
        echo       [!] Retrying...
        rmdir /s /q node_modules 2>nul
        call npm install
    )
)
echo       [OK] Dependencies ready

:: Check Ollama
echo [5/6] Checking Ollama...
set "OLLAMA_CMD="
if exist "bin\ollama\ollama.exe" (
    set "OLLAMA_CMD=%ROOT_DIR%\bin\ollama\ollama.exe"
    echo       [OK] Found portable Ollama
) else (
    where ollama >nul 2>&1
    if not errorlevel 1 (
        set "OLLAMA_CMD=ollama"
        echo       [OK] Found system Ollama
    ) else (
        echo       [*] Ollama not found. Place ollama.exe in bin\ollama\ or install from https://ollama.com
    )
)

:: Pull default model if Ollama available
if defined OLLAMA_CMD (
    echo [6/6] Checking default model...
    set "OLLAMA_MODELS=%ROOT_DIR%\models\ollama"
    curl -s http://localhost:11434/api/tags >nul 2>&1
    if errorlevel 1 (
        echo       [*] Starting Ollama to pull model...
        start /B "" !OLLAMA_CMD! serve >nul 2>&1
        timeout /t 5 /nobreak >nul
    )
    echo       [*] Pulling llama3.2 (this may take a while)...
    !OLLAMA_CMD! pull llama3.2
) else (
    echo [6/6] Skipping model pull (no Ollama)
)

echo.
echo  ========================================
echo   Setup Complete!
echo   Run start.bat to launch the app.
echo  ========================================
echo.
pause
endlocal
