@echo off
:: LocalDev AI - Windows Setup Script
:: This script sets up and runs the development environment

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       LocalDev AI - Setup Script         ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Check for Node.js
echo [1/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo    Please install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo ✓ Node.js %%i found

:: Check for npm
echo [2/4] Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm is not installed!
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do echo ✓ npm %%i found

:: Install dependencies
echo [3/4] Installing dependencies...
if not exist "node_modules" (
    echo    Running npm install...
    npm install
    if errorlevel 1 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
    echo ✓ Dependencies installed
) else (
    echo ✓ Dependencies already installed
)

:: Check for Ollama (optional)
echo [4/4] Checking optional services...
where ollama >nul 2>&1
if errorlevel 1 (
    echo    ⚠ Ollama not found (optional - for local LLM)
    echo      Install from https://ollama.ai
) else (
    echo ✓ Ollama found
)

echo.
echo ══════════════════════════════════════════
echo  Setup complete! Starting dev server...
echo ══════════════════════════════════════════
echo.
echo  The app will open at http://localhost:8080
echo  Press Ctrl+C to stop the server
echo.

:: Start the dev server
npm run dev

pause
