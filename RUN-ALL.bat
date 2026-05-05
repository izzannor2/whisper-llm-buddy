@echo off
setlocal enabledelayedexpansion
title AI Companion Hub - RUN-ALL (Portable)
color 0A

:: ============================================================
:: ONE-CLICK MASTER LAUNCHER
:: Visible failures. Agent verified before frontend launches.
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
echo.
echo  === PATH CHECK ===
echo  PROJECT_ROOT=%PROJECT_ROOT%
echo  Node candidates:
where node 2>nul
if exist "bin\node\node.exe" echo  Portable: %PROJECT_ROOT%\bin\node\node.exe
echo  ==================
echo.

:: --- 1. Self-heal portable folders ---
for %%D in (.ollama models\gguf models\ollama logs config bin\node bin\ollama bin\llama public\updates projects\3d) do (
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
    echo  [FATAL] Node.js not found. Install Node 20 LTS or run scripts\prepare-usb.bat
    pause
    exit /b 1
)
echo  [OK]   Node:   !NODE_BIN!

:: --- 3. Ensure dependencies installed ---
if not exist "node_modules" (
    echo  [..]  Installing dependencies (first run, may take a few minutes)...
    call !NPM_CMD! install
    if errorlevel 1 (
        echo  [FATAL] npm install failed. Check your network or run REPAIR-APP.bat.
        pause
        exit /b 1
    )
)
echo  [OK]   Dependencies present

:: --- 4. Optional: kill stray node processes (set KILL_NODE=1 to enable) ---
if /I "%KILL_NODE%"=="1" (
    echo  [..]  KILL_NODE=1 - terminating existing node.exe processes
    taskkill /f /im node.exe >nul 2>&1
)

:: --- 5. Start Ollama (optional) ---
set "OLLAMA_UP=0"
curl -s --max-time 2 http://127.0.0.1:11434/api/tags >nul 2>&1
if not errorlevel 1 (
    echo  [WARN] Ollama already running (external instance)
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
        if "!OLLAMA_UP!"=="1" (echo  [OK]   Ollama on :11434) else (echo  [INFO] Ollama did not respond - continuing)
    ) else (
        echo  [INFO] Ollama not installed - skipping
    )
)

:: --- 6. Start llama.cpp (optional) ---
set "LLAMA_BIN="
for /r "bin\llama" %%f in (llama-server.exe) do if not defined LLAMA_BIN set "LLAMA_BIN=%%~ff"
set "GGUF_FILE="
for /r "models\gguf" %%f in (*.gguf) do if not defined GGUF_FILE set "GGUF_FILE=%%~ff"
if defined LLAMA_BIN if defined GGUF_FILE (
    curl -s --max-time 1 http://127.0.0.1:8081/health >nul 2>&1
    if errorlevel 1 (
        echo  [..]  Starting llama-server with !GGUF_FILE!
        start "LLAMA" /B "!LLAMA_BIN!" -m "!GGUF_FILE!" --port 8081 --host 127.0.0.1 -ngl 99
        echo  [OK]   llama-server launching on :8081
    ) else (
        echo  [OK]   llama-server already on :8081
    )
) else (
    echo  [INFO] GGUF disabled - continuing
)

:: --- 7. Start backend agent (visible window so crashes are readable) ---
curl -s --max-time 1 http://127.0.0.1:3847/status >nul 2>&1
if not errorlevel 1 (
    echo  [OK]   Agent already running on :3847
    set "AGENT_OK=1"
    goto :agent_ready
)
echo  Starting agent...
start "AI Agent" cmd /k call "!NODE_BIN!" server\index.cjs
echo  Waiting for agent on :3847 ...
set "AGENT_OK=0"
for /l %%i in (1,1,15) do (
    timeout /t 1 /nobreak >nul
    curl -s --max-time 1 http://127.0.0.1:3847/status >nul 2>&1
    if not errorlevel 1 ( set "AGENT_OK=1" & goto :agent_ready )
)
:agent_ready
if not "!AGENT_OK!"=="1" (
    echo.
    echo  ============================================================
    echo    ERROR: Agent failed to start on :3847
    echo  ============================================================
    echo    Check the "AI Agent" command window for stack traces.
    echo    Common causes:
    echo      - Port 3847 already in use ^(set KILL_NODE=1 and retry^)
    echo      - Missing dependency ^(run REPAIR-APP.bat^)
    echo      - server\index.cjs syntax error
    echo  ============================================================
    pause
    exit /b 1
)
echo  [OK]   Agent responding on :3847

:: --- 8. Start frontend (only after agent is confirmed) ---
curl -s --max-time 1 http://127.0.0.1:8080 >nul 2>&1
if errorlevel 1 (
    echo  Starting frontend...
    start "WEB" cmd /k "call !NPM_CMD! run dev -- --host 0.0.0.0 --port 8080"
) else (
    echo  [OK]   Web already on :8080
)

:: --- 9. Wait for web ---
echo  [..]  Waiting for web server...
for /l %%i in (1,1,30) do (
    timeout /t 1 /nobreak >nul
    curl -s --max-time 1 http://127.0.0.1:8080 >nul 2>&1
    if not errorlevel 1 goto :web_ready
)
:web_ready

:: --- 10. Verify health endpoints ---
echo  [..]  Verifying services...
set "SNAP_OK=0"
set "DEV_OK=0"
set "THREED_OK=0"
curl -s --max-time 2 http://127.0.0.1:3847/debug/snapshot >nul 2>&1 && set "SNAP_OK=1"
curl -s --max-time 2 http://127.0.0.1:8080/dev-server/status >nul 2>&1 && set "DEV_OK=1"
curl -s --max-time 2 http://127.0.0.1:3847/3d/status >nul 2>&1 && set "THREED_OK=1"
echo  [OK]   /status
if "!SNAP_OK!"=="1"  (echo  [OK]   /debug/snapshot) else (echo  [WARN] /debug/snapshot not responding)
if "!DEV_OK!"=="1"   (echo  [OK]   /dev-server/status) else (echo  [INFO] /dev-server/status not responding)
if "!THREED_OK!"=="1" (echo  [OK]   /3d/status) else (echo  [WARN] /3d/status not responding)

start "" "http://localhost:8080"

echo.
echo  ============================================================
echo    READY
echo  ============================================================
echo    Open:
echo      http://localhost:8080
echo      http://127.0.0.1:3847/status
if "!OLLAMA_UP!"=="1" echo      http://localhost:11434
if defined GGUF_FILE if defined LLAMA_BIN echo      http://localhost:8081
echo    Logs:   %PROJECT_ROOT%\logs\
echo  ============================================================
echo.
echo  Closing this window does NOT stop services. Use STOP-PORTABLE-AI.bat to stop.
pause >nul
endlocal
