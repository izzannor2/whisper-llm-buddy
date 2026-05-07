@echo off
title AI Companion Hub - RUN-ALL (Portable)
color 0A

:: ============================================================
:: STAGE 0 - Transcript logging wrapper
:: ============================================================
cd /d "%~dp0"
if not exist "logs" mkdir "logs" 2>nul
if not defined _RUNALL_LOGGED (
    set "_RUNALL_LOGGED=1"
    echo [RUN-ALL] Transcript: %~dp0logs\run-all.log
    echo [RUN-ALL] Started %DATE% %TIME% > "logs\run-all.log"
    where powershell >nul 2>&1
    if not errorlevel 1 (
        cmd /c ""%~f0" %*" 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath 'logs\run-all.log' -Append"
    ) else (
        cmd /c ""%~f0" %*" >> "logs\run-all.log" 2>&1
        type "logs\run-all.log"
    )
    echo.
    echo [RUN-ALL] Exit code: %ERRORLEVEL%  ^(full log: logs\run-all.log^)
    pause
    exit /b %ERRORLEVEL%
)

setlocal enabledelayedexpansion
if /I "%DEBUG%"=="1" @echo on

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
echo  === ENVIRONMENT DUMP ===
echo  Date/Time : %DATE% %TIME%
echo  User      : %USERNAME%
echo  Computer  : %COMPUTERNAME%
echo  OS        : %OS%
echo  CWD       : %CD%
echo  PROJECT_ROOT=%PROJECT_ROOT%
echo  COMSPEC   : %COMSPEC%
echo.
echo  === TOOL CHECK ===
echo  - where node:
where node 2>&1
echo  - where npm:
where npm 2>&1
echo  - where curl:
where curl 2>&1
if exist "bin\node\node.exe" (
    echo  - Portable node: %PROJECT_ROOT%\bin\node\node.exe
) else (
    echo  - Portable node: NOT PRESENT
)
echo  ==================
echo.

:: --- 1. Self-heal portable folders ---
for %%D in (.ollama models\gguf models\ollama logs config bin\node bin\ollama bin\llama public\updates projects\3d) do (
    if not exist "%%D" mkdir "%%D" 2>nul
)

:: --- 2. Detect Node (flat control flow, no nested parens) ---
set "NODE_BIN="
set "NPM_CMD="
if exist "bin\node\node.exe" goto :node_portable
goto :node_system

:node_portable
set "NODE_BIN=%PROJECT_ROOT%\bin\node\node.exe"
set "NPM_CMD=%PROJECT_ROOT%\bin\node\npm.cmd"
set "PATH=%PROJECT_ROOT%\bin\node;%PATH%"
goto :node_done

:node_system
where node >nul 2>&1
if errorlevel 1 goto :node_missing
for /f "delims=" %%N in ('where node') do if not defined NODE_BIN set "NODE_BIN=%%N"
set "NPM_CMD=npm"
goto :node_done

:node_missing
echo  [FATAL] Node.js not found. Install Node 20 LTS or run scripts\prepare-usb.bat
pause
exit /b 1

:node_done
echo  [OK]   Node:   !NODE_BIN!
echo  [OK]   NPM :   !NPM_CMD!

:: --- 3. Ensure dependencies installed ---
if exist "node_modules" goto :deps_ok
echo  [..]  Installing dependencies (first run, may take a few minutes)...
call !NPM_CMD! install
if errorlevel 1 (
    echo  [FATAL] npm install failed. Check your network or run REPAIR-APP.bat.
    pause
    exit /b 1
)
:deps_ok
echo  [OK]   Dependencies present

:: --- 4. Optional: kill stray node processes ---
if /I "%KILL_NODE%"=="1" (
    echo  [..]  KILL_NODE=1 - terminating existing node.exe processes
    taskkill /f /im node.exe >nul 2>&1
)

:: --- 5. Start Ollama (optional, flat) ---
set "OLLAMA_UP=0"
curl -s --max-time 2 http://127.0.0.1:11434/api/tags >nul 2>&1
if not errorlevel 1 (
    echo  [WARN] Ollama already running ^(external instance^)
    set "OLLAMA_UP=1"
    goto :ollama_done
)
set "OLLAMA_BIN="
if exist "bin\ollama\ollama.exe" set "OLLAMA_BIN=%PROJECT_ROOT%\bin\ollama\ollama.exe"
if defined OLLAMA_BIN goto :ollama_have
where ollama >nul 2>&1
if errorlevel 1 goto :ollama_skip
for /f "delims=" %%O in ('where ollama') do if not defined OLLAMA_BIN set "OLLAMA_BIN=%%O"

:ollama_have
if not defined OLLAMA_BIN goto :ollama_skip
echo  [..]  Starting Ollama  ^(models: !OLLAMA_MODELS!^)
start "OLLAMA" /B cmd /c "set ""OLLAMA_MODELS=!OLLAMA_MODELS!"" & set ""OLLAMA_HOST=!OLLAMA_HOST!"" & ""!OLLAMA_BIN!"" serve >> logs\ollama.log 2>&1"
for /l %%i in (1,1,8) do (
    timeout /t 1 /nobreak >nul
    curl -s --max-time 1 http://127.0.0.1:11434/api/tags >nul 2>&1
    if not errorlevel 1 set "OLLAMA_UP=1"
)
if "!OLLAMA_UP!"=="1" (echo  [OK]   Ollama on :11434) else (echo  [INFO] Ollama did not respond - continuing)
goto :ollama_done

:ollama_skip
echo  [INFO] Ollama not installed - skipping

:ollama_done

:: --- 6. Start llama.cpp (optional) ---
set "LLAMA_BIN="
set "LLAMA_UP=0"
for /r "bin\llama" %%f in (llama-server.exe) do if not defined LLAMA_BIN set "LLAMA_BIN=%%~ff"
set "GGUF_FILE="
for /r "models\gguf" %%f in (*.gguf) do if not defined GGUF_FILE set "GGUF_FILE=%%~ff"
if not defined LLAMA_BIN goto :llama_skip
if not defined GGUF_FILE goto :llama_skip
curl -s --max-time 1 http://127.0.0.1:8081/health >nul 2>&1
if not errorlevel 1 (
    echo  [OK]   llama-server already on :8081
    set "LLAMA_UP=1"
    goto :llama_done
)
echo  [..]  Starting llama-server with !GGUF_FILE!
start "LLAMA" /B cmd /c """!LLAMA_BIN!"" -m ""!GGUF_FILE!"" --port 8081 --host 127.0.0.1 -ngl 99 >> logs\llama.log 2>&1"
for /l %%i in (1,1,8) do (
    timeout /t 1 /nobreak >nul
    curl -s --max-time 1 http://127.0.0.1:8081/health >nul 2>&1
    if not errorlevel 1 set "LLAMA_UP=1"
)
if "!LLAMA_UP!"=="1" (echo  [OK]   llama-server on :8081) else (echo  [WARN] llama-server did not respond - see logs\llama.log)
goto :llama_done

:llama_skip
echo  [INFO] GGUF disabled - continuing

:llama_done

:: --- 7. Start backend agent (visible window) ---
set "AGENT_OK=0"
curl -s --max-time 1 http://127.0.0.1:3847/status >nul 2>&1
if not errorlevel 1 (
    echo  [OK]   Agent already running on :3847
    set "AGENT_OK=1"
    goto :agent_done
)
echo  Starting agent...
start "AI Agent" cmd /k call "!NODE_BIN!" server\index.cjs
echo  Waiting for agent on :3847 ...
for /l %%i in (1,1,15) do (
    timeout /t 1 /nobreak >nul
    curl -s --max-time 1 http://127.0.0.1:3847/status >nul 2>&1
    if not errorlevel 1 set "AGENT_OK=1"
)
:agent_done
if not "!AGENT_OK!"=="1" (
    echo.
    echo  ============================================================
    echo    ERROR: Agent failed to start on :3847
    echo  ============================================================
    echo    Last 20 lines of logs\server.log:
    if exist "logs\server.log" (
        powershell -NoProfile -Command "Get-Content 'logs\server.log' -Tail 20" 2>nul
    ) else (
        echo    [no logs\server.log found]
    )
    echo.
    echo    Port 3847 owners (if any):
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3847 " ^| findstr "LISTENING"') do (
        echo      PID %%P
        for /f "tokens=1" %%N in ('tasklist /FI "PID eq %%P" /NH /FO CSV 2^>nul') do echo        process: %%N
    )
    echo    Common causes:
    echo      - Port 3847 already in use ^(set KILL_NODE=1 and retry^)
    echo      - Missing dependency ^(run REPAIR-APP.bat^)
    echo      - server\index.cjs syntax error
    echo  ============================================================
    pause
    exit /b 1
)
echo  [OK]   Agent responding on :3847

:: Check if frontend port 8080 is occupied by something else
netstat -ano | findstr ":8080 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    curl -s --max-time 1 http://127.0.0.1:8080 >nul 2>&1
    if errorlevel 1 (
        echo  [WARN] Port 8080 in use by another process:
        for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do (
            echo         PID %%P
            for /f "tokens=1" %%N in ('tasklist /FI "PID eq %%P" /NH /FO CSV 2^>nul') do echo           process: %%N
        )
    )
)

:: --- 8. Start frontend ---
curl -s --max-time 1 http://127.0.0.1:8080 >nul 2>&1
if not errorlevel 1 (
    echo  [OK]   Web already on :8080
    goto :web_started
)
echo  Starting frontend...
start "WEB" cmd /k "call !NPM_CMD! run dev -- --host 0.0.0.0 --port 8080"
:web_started

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
curl -s --max-time 2 http://127.0.0.1:3847/dev-server/status >nul 2>&1 && set "DEV_OK=1"
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
echo  Full transcript saved to: %PROJECT_ROOT%\logs\run-all.log
pause >nul
endlocal
exit /b 0
