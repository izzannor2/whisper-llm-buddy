@echo off
setlocal enabledelayedexpansion
title LocalDev AI - Setup
color 0B

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       LocalDev AI - Full Setup           ║
echo  ║                                          ║
echo  ║   Your Local AI Development Environment  ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ========================================
:: Step 1: Check Node.js
:: ========================================
echo [1/6] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please install Node.js from: https://nodejs.org
    echo  Recommended: LTS version ^(18.x or higher^)
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo       [OK] Node.js %%i found

:: ========================================
:: Step 2: Check npm / bun
:: ========================================
echo [2/6] Checking package manager...
set PKG_CMD=npm
where bun >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%i in ('bun --version') do echo       [OK] Bun %%i found ^(preferred^)
    set PKG_CMD=bun
) else (
    npm --version >nul 2>&1
    if errorlevel 1 (
        echo       [ERROR] npm is not installed!
        pause
        exit /b 1
    )
    for /f "tokens=*" %%i in ('npm --version') do echo       [OK] npm %%i found
)

:: ========================================
:: Step 3: Install dependencies (with retry)
:: ========================================
echo [3/6] Installing dependencies...

:: Auto-repair: check if node_modules is corrupted
if exist "node_modules" (
    if not exist "node_modules\.package-lock.json" (
        if not exist "node_modules\react" (
            echo       [!] node_modules appears corrupted, reinstalling...
            rmdir /s /q node_modules 2>nul
        )
    )
)

if exist "node_modules" (
    echo       [OK] Dependencies already installed
    echo       [*] Checking for updates...
    !PKG_CMD! install --silent 2>nul || !PKG_CMD! install
) else (
    set INSTALL_SUCCESS=0
    for /l %%A in (1,1,3) do (
        if !INSTALL_SUCCESS!==0 (
            echo       [*] Attempt %%A/3: Running !PKG_CMD! install...
            !PKG_CMD! install
            if not errorlevel 1 (
                set INSTALL_SUCCESS=1
            ) else (
                echo       [!] Attempt %%A failed, retrying in 3 seconds...
                timeout /t 3 /nobreak >nul
            )
        )
    )
    if !INSTALL_SUCCESS!==0 (
        echo.
        echo  [ERROR] Failed to install dependencies after 3 attempts!
        echo  Please check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo       [OK] Dependencies installed successfully
)

:: ========================================
:: Step 4: Create models directory
:: ========================================
echo [4/6] Setting up models directory...
if not exist "models\gguf" mkdir "models\gguf" 2>nul
if not exist "bin\llama" mkdir "bin\llama" 2>nul
if not exist "bin\ollama" mkdir "bin\ollama" 2>nul
echo       [OK] Directory structure ready

:: Check for existing GGUF models
set GGUF_COUNT=0
for %%f in (models\gguf\*.gguf) do set /a GGUF_COUNT+=1
if !GGUF_COUNT! GTR 0 (
    echo       [OK] Found !GGUF_COUNT! GGUF model^(s^) ready to use
) else (
    echo       [!] No GGUF models found
    echo           Add .gguf files to models\gguf\ for auto-loading
)

:: ========================================
:: Step 5: Check Ollama (optional)
:: ========================================
echo [5/6] Checking Ollama ^(Local LLM^)...
set OLLAMA_FOUND=0
if exist "bin\ollama\ollama.exe" (
    set OLLAMA_FOUND=1
    echo       [OK] Local Ollama found in bin\ollama\
) else (
    where ollama >nul 2>&1
    if not errorlevel 1 (
        set OLLAMA_FOUND=1
        for /f "tokens=*" %%i in ('ollama --version 2^>nul') do echo       [OK] %%i
    )
)
if !OLLAMA_FOUND!==0 (
    echo       [!] Ollama not found ^(optional^)
    echo           Install from: https://ollama.ai
    echo           Or place ollama.exe in bin\ollama\
) else (
    :: Try to start Ollama if not running
    curl -s http://localhost:11434/api/tags >nul 2>&1
    if errorlevel 1 (
        echo       [*] Starting Ollama server...
        start /B ollama serve >nul 2>&1
        timeout /t 2 /nobreak >nul
    )
)

:: ========================================
:: Step 6: Check llama.cpp (optional)
:: ========================================
echo [6/6] Checking llama.cpp ^(GGUF models^)...
set LLAMA_FOUND=0
if exist "bin\llama\llama-server.exe" (
    set LLAMA_FOUND=1
    echo       [OK] llama-server found in bin\llama\
) else (
    where llama-server >nul 2>&1
    if not errorlevel 1 (
        set LLAMA_FOUND=1
        echo       [OK] llama-server found in PATH
    )
)
if !LLAMA_FOUND!==0 (
    echo       [!] llama.cpp not found ^(optional^)
    echo           Build from: https://github.com/ggerganov/llama.cpp
    echo           Or place llama-server.exe in bin\llama\
)

:: ========================================
:: Setup Complete
:: ========================================
echo.
echo  ══════════════════════════════════════════
echo   Setup Complete!
echo  ══════════════════════════════════════════
echo.
echo   To start the app:
echo     - Double-click start.bat
echo     - Or run: !PKG_CMD! run dev
echo.
echo   The app will open at: http://localhost:8080
echo.
echo   Model Setup:
echo     - GGUF models: Place in models\gguf\
echo     - Ollama: Run "ollama pull llama3.2"
echo     - Scripts auto-detect and launch models!
echo.
echo  ══════════════════════════════════════════
echo.

:: Ask if user wants to start now
set /p STARTAPP="Start the app now? (Y/N): "
if /i "!STARTAPP!"=="Y" (
    echo.
    echo  Starting LocalDev AI...
    call start.bat
) else (
    echo.
    echo  Run start.bat when you're ready!
    pause
)
endlocal