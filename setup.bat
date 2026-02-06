@echo off
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
echo [1/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please install Node.js from: https://nodejs.org
    echo  Recommended: LTS version (18.x or higher)
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo       [OK] Node.js %%i found

:: ========================================
:: Step 2: Check npm
:: ========================================
echo [2/5] Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo       [ERROR] npm is not installed!
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do echo       [OK] npm %%i found

:: ========================================
:: Step 3: Install dependencies
:: ========================================
echo [3/5] Installing dependencies...
if exist "node_modules" (
    echo       [OK] Dependencies already installed
    echo       [*] Checking for updates...
    npm install --silent
) else (
    echo       [*] Running npm install (this may take a minute)...
    npm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] Failed to install dependencies!
        echo  Please check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo       [OK] Dependencies installed successfully
)

:: ========================================
:: Step 4: Check Ollama (optional)
:: ========================================
echo [4/5] Checking Ollama (Local LLM)...
where ollama >nul 2>&1
if errorlevel 1 (
    echo       [!] Ollama not found (optional)
    echo           Install from: https://ollama.ai
    echo           Required for local AI features
) else (
    for /f "tokens=*" %%i in ('ollama --version 2^>nul') do echo       [OK] %%i
    
    :: Try to start Ollama if not running
    curl -s http://localhost:11434/api/tags >nul 2>&1
    if errorlevel 1 (
        echo       [*] Starting Ollama server...
        start /B ollama serve >nul 2>&1
        timeout /t 2 /nobreak >nul
    )
    
    :: Check for recommended models
    echo       [*] Checking for AI models...
    ollama list 2>nul | findstr /i "llama3" >nul
    if errorlevel 1 (
        echo       [!] No Llama model found
        echo           Run: ollama pull llama3.2
    ) else (
        echo       [OK] Llama model available
    )
)

:: ========================================
:: Step 5: Check llama.cpp (optional)
:: ========================================
echo [5/5] Checking llama.cpp (GGUF models)...
where llama-server >nul 2>&1
if errorlevel 1 (
    where llama-cli >nul 2>&1
    if errorlevel 1 (
        echo       [!] llama.cpp not found (optional)
        echo           Build from: https://github.com/ggerganov/llama.cpp
        echo           Required for custom GGUF models
    ) else (
        echo       [OK] llama-cli found
    )
) else (
    echo       [OK] llama-server found
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
echo     - Or run: npm run dev
echo.
echo   The app will open at: http://localhost:8080
echo.
echo   Quick Tips:
echo     - Use Ollama for local AI (ollama pull llama3.2)
echo     - Enable GPU acceleration in Settings
echo     - Try App Builder mode for full IDE experience
echo.
echo  ══════════════════════════════════════════
echo.

:: Ask if user wants to start now
set /p STARTAPP="Start the app now? (Y/N): "
if /i "%STARTAPP%"=="Y" (
    echo.
    echo  Starting LocalDev AI...
    call start.bat
) else (
    echo.
    echo  Run start.bat when you're ready!
    pause
)
