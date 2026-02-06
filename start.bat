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

:: ========================================
:: Check for GGUF models in models/gguf/
:: ========================================
set GGUF_MODEL=
set LLAMA_SERVER_RUNNING=0

if exist "models\gguf" (
    for %%f in (models\gguf\*.gguf) do (
        if not defined GGUF_MODEL (
            set "GGUF_MODEL=%%f"
        )
    )
)

if defined GGUF_MODEL (
    echo [*] Found GGUF model: %GGUF_MODEL%
    
    :: Check if llama-server is available
    where llama-server >nul 2>&1
    if not errorlevel 1 (
        :: Check if llama-server is already running
        curl -s http://localhost:8081/health >nul 2>&1
        if errorlevel 1 (
            echo [*] Starting llama-server with detected model...
            start /B "LlamaServer" llama-server -m "%GGUF_MODEL%" --port 8081 --host 0.0.0.0 -ngl 99 >nul 2>&1
            set LLAMA_SERVER_RUNNING=1
            timeout /t 3 /nobreak >nul
            echo [OK] llama-server started on port 8081
        ) else (
            echo [OK] llama-server already running on port 8081
            set LLAMA_SERVER_RUNNING=1
        )
    ) else (
        echo [!] llama-server not found in PATH
        echo     Install from: https://github.com/ggerganov/llama.cpp
        echo     The model will be available when llama-server is installed
    )
) else (
    echo [*] No GGUF models found in models\gguf\
    echo     Add .gguf files there for auto-detection
)

:: ========================================
:: Check if Ollama is running (fallback)
:: ========================================
if %LLAMA_SERVER_RUNNING%==0 (
    echo [*] Checking Ollama status...
    curl -s http://localhost:11434/api/tags >nul 2>&1
    if errorlevel 1 (
        echo [!] Ollama not detected at localhost:11434
        where ollama >nul 2>&1
        if not errorlevel 1 (
            echo     Starting Ollama in background...
            start /B ollama serve >nul 2>&1
            timeout /t 2 /nobreak >nul
        ) else (
            echo [!] Ollama not installed - AI features will use Cloud backend
            echo     Install from: https://ollama.ai
        )
    ) else (
        echo [OK] Ollama is running
    )
)

echo.
echo ══════════════════════════════════════════
echo  Starting development server...
echo  App will open at: http://localhost:8080
echo ══════════════════════════════════════════
echo.
if defined GGUF_MODEL (
    echo  Local LLM: llama-server ^(port 8081^)
)
echo  Press Ctrl+C to stop the server
echo.

:: Open browser after a short delay
start /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:8080"

:: Start the dev server
npm run dev
