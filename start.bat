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
    :: Try bun first, fall back to npm
    where bun >nul 2>&1
    if not errorlevel 1 (
        bun install
    ) else (
        call npm install
    )
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
:: Detect local binaries in bin/ folder
:: ========================================
set LLAMA_SERVER_CMD=
set OLLAMA_CMD=

:: Check for local llama-server first
if exist "bin\llama\llama-server.exe" (
    set "LLAMA_SERVER_CMD=bin\llama\llama-server.exe"
    echo [OK] Found local llama-server in bin\llama\
) else (
    where llama-server >nul 2>&1
    if not errorlevel 1 (
        set "LLAMA_SERVER_CMD=llama-server"
    )
)

:: Check for local Ollama first
if exist "bin\ollama\ollama.exe" (
    set "OLLAMA_CMD=bin\ollama\ollama.exe"
    echo [OK] Found local Ollama in bin\ollama\
) else (
    where ollama >nul 2>&1
    if not errorlevel 1 (
        set "OLLAMA_CMD=ollama"
    )
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
    
    if defined LLAMA_SERVER_CMD (
        :: Check if llama-server is already running
        curl -s http://localhost:8081/health >nul 2>&1
        if errorlevel 1 (
            echo [*] Starting llama-server with detected model...
            start /B "LlamaServer" %LLAMA_SERVER_CMD% -m "%GGUF_MODEL%" --port 8081 --host 0.0.0.0 -ngl 99 >nul 2>&1
            set LLAMA_SERVER_RUNNING=1
            timeout /t 3 /nobreak >nul
            echo [OK] llama-server started on port 8081
        ) else (
            echo [OK] llama-server already running on port 8081
            set LLAMA_SERVER_RUNNING=1
        )
    ) else (
        echo [!] llama-server not found
        echo     Place llama-server.exe in bin\llama\ or install to PATH
        echo     Build from: https://github.com/ggerganov/llama.cpp
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
        if defined OLLAMA_CMD (
            echo     Starting Ollama in background...
            :: Set correct host to avoid config issues
            set "OLLAMA_HOST=127.0.0.1:11434"
            start "" /B cmd /c "set OLLAMA_HOST=127.0.0.1:11434 && "%OLLAMA_CMD%" serve"
            echo     Waiting for Ollama to initialize...
            timeout /t 5 /nobreak >nul
            :: Verify Ollama started
            curl -s http://localhost:11434/api/tags >nul 2>&1
            if errorlevel 1 (
                echo     [!] Ollama failed to start. Check if another instance is running.
                echo     [!] Try running manually: %OLLAMA_CMD% serve
            ) else (
                echo     [OK] Ollama started successfully!
            )
        ) else (
            echo [!] Ollama not found - AI features will use Cloud backend
            echo     Place ollama.exe in bin\ollama\ or install from: https://ollama.ai
        )
    ) else (
        echo [OK] Ollama is running
    )
)

:: ========================================
:: Check port 8080 availability
:: ========================================
netstat -an 2>nul | findstr ":8080 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo [!] Port 8080 is already in use.
    echo     The dev server will try to use the next available port.
    echo.
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

:: Start the dev server (try bun first)
where bun >nul 2>&1
if not errorlevel 1 (
    bun run dev
) else (
    npm run dev
)
