@echo off
setlocal enabledelayedexpansion
title LocalDev AI - Offline (USB)
color 0A

:: ====================================================
:: Pure offline launcher - no network, no installs.
:: Uses portable Node + Ollama from bin\, prebuilt dist\
:: ====================================================
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "ROOT=%CD%"

echo.
echo  ==========================================
echo    LocalDev AI - OFFLINE MODE (USB)
echo  ==========================================
echo.

:: Self-heal directories (.ollama is the portable Ollama model dir)
for %%D in (logs models\gguf models\ollama .ollama public\updates bin\node bin\ollama bin\llama config) do (
    if not exist "%%D" mkdir "%%D" 2>nul
)

:: Reset PID tracker (truncate, no blank line)
break > "logs\pids.txt"

:: ----------------------------------------------------
:: PREFLIGHT - verify ports free + required files exist
:: ----------------------------------------------------
echo [0/4] Running preflight checks...
set "PREFLIGHT_FAIL=0"

for %%F in ("bin\node\node.exe" "server\index.cjs" "server\static.cjs" "dist\index.html") do (
    if not exist %%F (
        echo       [FAIL] Missing: %%F
        set "PREFLIGHT_FAIL=1"
    )
)

for %%P in (8080 3847) do (
    netstat -ano | findstr ":%%P " | findstr "LISTENING" >nul 2>&1
    if not errorlevel 1 (
        echo       [FAIL] Port %%P already in use
        set "PREFLIGHT_FAIL=1"
    )
)
netstat -ano | findstr ":11434 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 echo       [WARN] Port 11434 in use - will reuse existing Ollama

if "!PREFLIGHT_FAIL!"=="1" (
    echo.
    echo  [ERROR] Preflight failed. Fix issues above and retry.
    echo  - Run scripts\prepare-usb.bat to install missing files
    echo  - Run stop-offline.bat to free ports from a previous run
    pause & exit /b 1
)
echo       [OK] All checks passed

set "PATH=%ROOT%\bin\node;%ROOT%\bin\ollama;%PATH%"
echo [1/4] [OK] Portable Node.js ready

:: ----------------------------------------------------
:: Snapshot pre-existing node.exe / ollama.exe / llama-server.exe PIDs
:: so we can detect newly spawned ones reliably (PID diffing).
:: We set per-PID env vars: SEEN_<imagename>_<pid>=1
:: ----------------------------------------------------
for %%I in (node.exe ollama.exe llama-server.exe) do (
    for /f "tokens=2 delims=," %%P in ('tasklist /FI "IMAGENAME eq %%I" /NH /FO CSV 2^>nul') do (
        set "PID=%%~P"
        set "SEEN_%%I_!PID!=1"
    )
)

:: ----------------------------------------------------
:: Portable Ollama (optional)
:: ----------------------------------------------------
set "OLLAMA_RUNNING=0"
:: Prefer .ollama (per spec), fall back to legacy models\ollama for back-compat
set "OLLAMA_DIR=%ROOT%\.ollama"
if not exist "%ROOT%\.ollama\models" if exist "%ROOT%\models\ollama\models" set "OLLAMA_DIR=%ROOT%\models\ollama"
if exist "bin\ollama\ollama.exe" (
    set "OLLAMA_MODELS=!OLLAMA_DIR!"
    set "OLLAMA_HOST=127.0.0.1:11434"
    curl -s http://localhost:11434/api/tags >nul 2>&1
    if errorlevel 1 (
        echo [2/4] [*] Starting portable Ollama...
        start "OLLAMA" /B cmd /c "set OLLAMA_MODELS=!OLLAMA_DIR!& set OLLAMA_HOST=127.0.0.1:11434& bin\ollama\ollama.exe serve >> logs\ollama.log 2>&1"
        timeout /t 2 /nobreak >nul
        call :capture_new_pid ollama.exe
        for /l %%i in (1,1,10) do (
            curl -s http://localhost:11434/api/tags >nul 2>&1
            if not errorlevel 1 (
                set "OLLAMA_RUNNING=1"
                goto :ollama_done
            )
            timeout /t 1 /nobreak >nul
        )
    ) else (
        set "OLLAMA_RUNNING=1"
    )
)
:ollama_done
if "!OLLAMA_RUNNING!"=="1" (
    echo [2/4] [OK] Ollama on :11434  (models: !OLLAMA_DIR!)
) else (
    echo [2/4] [*] Ollama not started - app will run without it
)

:: ----------------------------------------------------
:: Optional llama-server for GGUF
:: ----------------------------------------------------
set "GGUF_MODEL="
if exist "models\gguf" (
    for %%f in (models\gguf\*.gguf) do (
        if not defined GGUF_MODEL set "GGUF_MODEL=%%f"
    )
)
if defined GGUF_MODEL if exist "bin\llama\llama-server.exe" (
    curl -s http://localhost:8081/health >nul 2>&1
    if errorlevel 1 (
        echo       [*] Starting llama-server with !GGUF_MODEL!
        start "LLAMA" /B cmd /c "bin\llama\llama-server.exe -m \"!GGUF_MODEL!\" --port 8081 --host 0.0.0.0 -ngl 99 >> logs\llama.log 2>&1"
        timeout /t 2 /nobreak >nul
        call :capture_new_pid llama-server.exe
    )
)

:: ----------------------------------------------------
:: Local Agent server on 3847
:: ----------------------------------------------------
echo [3/4] [*] Starting local agent on :3847...
start "AGENT" /B cmd /c "bin\node\node.exe server\index.cjs >> logs\agent.log 2>&1"
timeout /t 2 /nobreak >nul
call :capture_new_pid node.exe
echo       [OK] Agent launched

:: ----------------------------------------------------
:: Static web server for dist\
:: ----------------------------------------------------
echo [4/4] [*] Starting web server on :8080...
start "WEB" /B cmd /c "bin\node\node.exe server\static.cjs >> logs\web.log 2>&1"
timeout /t 2 /nobreak >nul
call :capture_new_pid node.exe

:: Open browser
start /B cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8080"

echo.
echo  ==========================================
echo    READY - http://localhost:8080
echo  ==========================================
echo    App:    http://localhost:8080
if "!OLLAMA_RUNNING!"=="1" echo    Ollama: http://localhost:11434
if defined GGUF_MODEL echo    Llama:  http://localhost:8081
echo    Agent:  http://localhost:3847
echo    Logs:   %ROOT%\logs\
echo.
echo    To stop: run stop-offline.bat
echo  ==========================================
echo.
echo  Press any key to keep this window open...
echo  (closing this window does NOT stop services)
pause >nul
endlocal
goto :eof

:: ----------------------------------------------------
:: :capture_new_pid <imagename>
:: Compares current PIDs of <imagename> against the SEEN_ map.
:: Any PID not in the map is appended to logs\pids.txt and added
:: to the map so it isn't double-captured by later launches.
:: ----------------------------------------------------
:capture_new_pid
set "IMG=%~1"
for /f "tokens=2 delims=," %%P in ('tasklist /FI "IMAGENAME eq %IMG%" /NH /FO CSV 2^>nul') do (
    set "PID=%%~P"
    if not defined SEEN_%IMG%_!PID! (
        echo !PID!>> "logs\pids.txt"
        set "SEEN_%IMG%_!PID!=1"
    )
)
goto :eof
