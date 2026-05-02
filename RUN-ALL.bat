@echo off
setlocal enabledelayedexpansion
title AI Companion Hub - RUN-ALL (Portable)
color 0A

:: ============================================================
:: ONE-CLICK MASTER LAUNCHER
:: Works from ANY drive. No hardcoded paths. Degrades gracefully.
:: ============================================================
cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "OLLAMA_MODELS=%PROJECT_ROOT%\.ollama"
set "OLLAMA_HOST=127.0.0.1:11434"
set "GGUF_MODELS=%PROJECT_ROOT%\models\gguf"

echo.
echo  ============================================================
echo    AI Companion Hub - RUN-ALL
echo  ============================================================
echo    Project root: %PROJECT_ROOT%
echo    Ollama models: %OLLAMA_MODELS%
echo  ============================================================
echo.

:: --- 1. Self-heal portable folders ---
for %%D in (.ollama models\gguf models\ollama logs config bin\node bin\ollama bin\llama public\updates) do (
    if not exist "%%D" mkdir "%%D" 2>nul
)

:: --- 2. Detect Node ---
set "NODE_BIN="
if exist "bin\node\node.exe" (
    set "NODE_BIN=%PROJECT_ROOT%\bin\node\node.exe"
    set "NPM_CMD=%PROJECT_ROOT%\bin\node\npm.cmd"
    set "PATH=%PROJECT_ROOT%\bin\node;%PATH%"
) else (
    where node >nul 2>&1
    if not errorlevel 1 (
        for /f "delims=" %%N in ('where node') do if not defined NODE_BIN set "NODE_BIN=%%N"
        set "NPM_CMD=npm"
    )
)
if not defined NODE_BIN (
    echo  [FATAL] Node.js not found. Place portable Node in bin\node\ or install Node 20 LTS.
    pause & exit /b 1
)
echo  [OK]   Node:   !NODE_BIN!

:: --- 3. Ensure dependencies installed ---
if not exist "node_modules" (
    echo  [..]  Installing dependencies (first run, may take a few minutes)...
    call !NPM_CMD! install
    if errorlevel 1 (
        echo  [FATAL] npm install failed. Check your network or run REPAIR-APP.bat.
        pause & exit /b 1
    )
)
echo  [OK]   Dependencies present

:: --- 4. Start Ollama (optional) ---
set "OLLAMA_UP=0"
curl -s --max-time 2 http://127.0.0.1:11434/api/tags >nul 2>&1
if not errorlevel 1 (
    echo  [WARN] Ollama is already running.
    echo         If its model folder is NOT %OLLAMA_MODELS%,
    echo         stop it (STOP-PORTABLE-AI.bat) then re-run this script,
    echo         or click "Restart Ollama Portable" inside the app.
    set "OLLAMA_UP=1"
) else (
    set "OLLAMA_BIN="
    if exist "bin\ollama\ollama.exe" set "OLLAMA_BIN=%PROJECT_ROOT%\bin\ollama\ollama.exe"
    if not defined OLLAMA_BIN (
        where ollama >nul 2>&1
        if not errorlevel 1 for /f "delims=" %%O in ('where ollama') do if not defined OLLAMA_BIN set "OLLAMA_BIN=%%O"
    )
    if defined OLLAMA_BIN (
        echo  [..]  Starting Ollama  ^(models: !OLLAMA_MODELS!^)
        start "OLLAMA" /B cmd /c "set OLLAMA_MODELS=!OLLAMA_MODELS!&& set OLLAMA_HOST=!OLLAMA_HOST!&& "!OLLAMA_BIN!" serve >> logs\ollama.log 2>&1"
        for /l %%i in (1,1,8) do (
            timeout /t 1 /nobreak >nul
            curl -s --max-time 1 http://127.0.0.1:11434/api/tags >nul 2>&1
            if not errorlevel 1 ( set "OLLAMA_UP=1" & goto :ollama_ready )
        )
        :ollama_ready
        if "!OLLAMA_UP!"=="1" (echo  [OK]   Ollama on :11434) else (echo  [INFO] Ollama did not respond - continuing anyway)
    ) else (
        echo  [INFO] Ollama not installed - skipping ^(app still works with GGUF or cloud^)
    )
)

:: --- 5. Start llama.cpp (optional, recursive search) ---
set "LLAMA_BIN="
for /r "bin\llama" %%f in (llama-server.exe) do if not defined LLAMA_BIN set "LLAMA_BIN=%%~ff"
set "GGUF_FILE="
for /r "models\gguf" %%f in (*.gguf) do if not defined GGUF_FILE set "GGUF_FILE=%%~ff"
if defined LLAMA_BIN if defined GGUF_FILE (
    curl -s --max-time 1 http://127.0.0.1:8081/health >nul 2>&1
    if errorlevel 1 (
        echo  [..]  Starting llama-server with !GGUF_FILE!
        start "LLAMA" /B cmd /c "\"!LLAMA_BIN!\" -m \"!GGUF_FILE!\" --port 8081 --host 127.0.0.1 -ngl 99 >> logs\llama.log 2>&1"
        echo  [OK]   llama-server launching on :8081
    ) else (
        echo  [OK]   llama-server already on :8081
    )
) else (
    echo  [INFO] GGUF disabled - continuing with Ollama
)

:: --- 6. Backend agent ---
curl -s --max-time 1 http://127.0.0.1:3847/status >nul 2>&1
if errorlevel 1 (
    echo  [..]  Starting backend agent on :3847
    start "AGENT" /B cmd /c "\"!NODE_BIN!\" server\index.cjs >> logs\agent.log 2>&1"
) else (
    echo  [OK]   Agent already on :3847
)

:: --- 7. Frontend dev server ---
curl -s --max-time 1 http://127.0.0.1:8080 >nul 2>&1
if errorlevel 1 (
    echo  [..]  Starting dev server on :8080
    start "WEB" /B cmd /c "call !NPM_CMD! run dev -- --host 0.0.0.0 --port 8080 >> logs\web.log 2>&1"
) else (
    echo  [OK]   Web already on :8080
)

:: --- 8. Wait for web, then open browser ---
echo  [..]  Waiting for web server...
for /l %%i in (1,1,30) do (
    timeout /t 1 /nobreak >nul
    curl -s --max-time 1 http://127.0.0.1:8080 >nul 2>&1
    if not errorlevel 1 goto :web_ready
)
:web_ready
start "" "http://localhost:8080"

echo.
echo  ============================================================
echo    READY
echo  ============================================================
echo    App:    http://localhost:8080
echo    Agent:  http://localhost:3847
if "!OLLAMA_UP!"=="1" echo    Ollama: http://localhost:11434
if defined GGUF_FILE if defined LLAMA_BIN echo    Llama:  http://localhost:8081
echo    Logs:   %PROJECT_ROOT%\logs\
echo  ============================================================
echo.
echo  Closing this window does NOT stop services. Use STOP-PORTABLE-AI.bat to stop.
pause >nul
endlocal
