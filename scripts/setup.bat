@echo off
setlocal enabledelayedexpansion
title AI Companion Hub - One-Click Setup
color 0B

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
cd /d "%ROOT_DIR%"
set "ROOT_DIR=%CD%"

echo.
echo  ========================================
echo   AI Companion Hub - First-Time Setup
echo  ========================================
echo   Does NOT download any model.
echo   Use scripts\advanced\PULL-DEFAULT-MODEL.bat
echo   to fetch qwen2.5:3b once Ollama is up.
echo  ========================================
echo.

:: --- 1. Create canonical directories (must match RUN-ALL.bat / config) ---
echo [1/5] Creating directories...
for %%D in (config logs .ollama models\gguf bin\ollama bin\llama bin\node public\updates projects\3d) do (
    if not exist "%%D" mkdir "%%D" 2>nul
)
echo       [OK] Directory structure ready

:: --- 2. Default config (single source of truth) ---
echo [2/5] Checking config\settings.json...
if not exist "config\settings.json" (
    (
        echo {
        echo   "ollama_path": "./bin/ollama",
        echo   "llama_path": "./bin/llama",
        echo   "model_path": "./.ollama",
        echo   "gguf_path": "./models/gguf",
        echo   "log_path": "./logs",
        echo   "default_model": "qwen2.5:3b",
        echo   "auto_start_ollama": true,
        echo   "ollama_port": 11434,
        echo   "llama_port": 8081,
        echo   "app_port": 8080,
        echo   "agent_port": 3847
        echo }
    ) > "config\settings.json"
    echo       [OK] Created default config
) else (
    echo       [OK] Config exists
)

:: --- 3. Node.js ---
echo [3/5] Checking Node.js...
if exist "bin\node\node.exe" (
    set "PATH=%ROOT_DIR%\bin\node;%PATH%"
    echo       [OK] Using portable Node.js
    goto :node_ready
)
where node >nul 2>&1
if not errorlevel 1 (
    echo       [OK] Using system Node.js
    goto :node_ready
)
echo       [!] Node.js not found
where winget >nul 2>&1
if not errorlevel 1 (
    echo       [*] Installing via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    where node >nul 2>&1
    if not errorlevel 1 goto :node_ready
)
echo       [ERROR] Install Node.js 20 LTS from https://nodejs.org
echo                or run scripts\prepare-usb.bat for a portable copy.
pause
exit /b 1
:node_ready
for /f "tokens=*" %%i in ('node --version 2^>nul') do echo       Version: %%i

:: --- 4. npm install ---
echo [4/5] Installing npm packages...
if exist "node_modules\react" (
    echo       [OK] Dependencies already present
) else (
    if exist "package-lock.json" (
        call npm ci
    ) else (
        call npm install
    )
    if errorlevel 1 (
        echo       [!] First attempt failed - retrying clean install
        rmdir /s /q node_modules 2>nul
        call npm install
        if errorlevel 1 (
            echo       [ERROR] npm install failed
            pause & exit /b 1
        )
    )
    echo       [OK] Dependencies installed
)

:: --- 5. Ollama detection (do NOT pull any model here) ---
echo [5/5] Checking Ollama...
if exist "bin\ollama\ollama.exe" (
    echo       [OK] Portable Ollama found at bin\ollama\ollama.exe
    goto :ollama_done
)
where ollama >nul 2>&1
if not errorlevel 1 (
    echo       [OK] System Ollama on PATH
    goto :ollama_done
)
echo       [INFO] Ollama not installed.
echo              Install from https://ollama.com OR run scripts\prepare-usb.bat
echo              for a portable copy in bin\ollama\.
:ollama_done

echo.
echo  ========================================
echo   Setup Complete
echo  ========================================
echo   Next:
echo     1. RUN-ALL.bat                          (start everything)
echo     2. scripts\verify-links.bat             (verify wiring)
echo     3. scripts\advanced\PULL-DEFAULT-MODEL.bat   (optional: fetch model)
echo     4. scripts\test-all.bat                 (full acceptance run)
echo  ========================================
echo.
pause
endlocal
