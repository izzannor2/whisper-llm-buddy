@echo off
title LocalDev AI - Development Server
color 0A

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         LocalDev AI - Quick Start        ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo [!] Dependencies not installed. Running setup first...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install dependencies!
        echo Please run setup.bat first or check your Node.js installation.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed successfully!
    echo.
)

:: Check if Ollama is running (optional)
echo [*] Checking Ollama status...
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo [!] Ollama not detected at localhost:11434
    echo     Starting Ollama in background...
    where ollama >nul 2>&1
    if not errorlevel 1 (
        start /B ollama serve >nul 2>&1
        timeout /t 2 /nobreak >nul
    ) else (
        echo [!] Ollama not installed - AI features will use fallback
        echo     Install from: https://ollama.ai
    )
) else (
    echo [OK] Ollama is running
)

echo.
echo ══════════════════════════════════════════
echo  Starting development server...
echo  App will open at: http://localhost:8080
echo ══════════════════════════════════════════
echo.
echo  Press Ctrl+C to stop the server
echo.

:: Open browser after a short delay
start /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:8080"

:: Start the dev server
npm run dev
