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

:: Self-heal directories
for %%D in (logs models\gguf models\ollama bin\node bin\ollama bin\llama config) do (
    if not exist "%%D" mkdir "%%D" 2>nul
)

:: Reset PID tracker
> "logs\pids.txt" echo.

:: ----------------------------------------------------
:: Verify portable Node.js
:: ----------------------------------------------------
if not exist "bin\node\node.exe" (
    echo  [ERROR] Portable Node.js missing.
    echo  Run scripts\prepare-usb.bat on a connected PC first.
    pause & exit /b 1
)
set "PATH=%ROOT%\bin\node;%ROOT%\bin\ollama;%PATH%"
echo [1/4] [OK] Portable Node.js ready

:: ----------------------------------------------------
:: Portable Ollama (optional)
:: ----------------------------------------------------
set "OLLAMA_RUNNING=0"
if exist "bin\ollama\ollama.exe" (
    set "OLLAMA_MODELS=%ROOT%\models\ollama"
    set "OLLAMA_HOST=127.0.0.1:11434"
    curl -s http://localhost:11434/api/tags >nul 2>&1
    if errorlevel 1 (
        echo [2/4] [*] Starting portable Ollama...
        start "OLLAMA" /B cmd /c "set OLLAMA_MODELS=%ROOT%\models\ollama&& set OLLAMA_HOST=127.0.0.1:11434&& bin\ollama\ollama.exe serve >> logs\ollama.log 2>&1"
        powershell -NoProfile -Command "(Get-Process ollama -ErrorAction SilentlyContinue | Select-Object -First 1).Id" >> "logs\pids.txt" 2>nul
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
    echo [2/4] [OK] Ollama on :11434  (models: %ROOT%\models\ollama)
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
        powershell -NoProfile -Command "(Get-Process llama-server -ErrorAction SilentlyContinue | Select-Object -First 1).Id" >> "logs\pids.txt" 2>nul
    )
)

:: ----------------------------------------------------
:: Local Agent server on 3847
:: ----------------------------------------------------
if exist "server\index.js" (
    echo [3/4] [*] Starting local agent on :3847...
    start "AGENT" /B cmd /c "bin\node\node.exe server\index.js >> logs\agent.log 2>&1"
    powershell -NoProfile -Command "Start-Sleep -Milliseconds 500; (Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*server\index.js*' } | Select-Object -First 1).ProcessId" >> "logs\pids.txt" 2>nul
    echo       [OK] Agent launched
) else (
    echo [3/4] [!] server\index.js missing - skipping agent
)

:: ----------------------------------------------------
:: Static web server for dist\
:: ----------------------------------------------------
if not exist "dist\index.html" (
    echo  [ERROR] dist\ not built. Run scripts\prepare-usb.bat first.
    pause & exit /b 1
)
echo [4/4] [*] Starting web server on :8080...
start "WEB" /B cmd /c "bin\node\node.exe server\static.cjs >> logs\web.log 2>&1"
powershell -NoProfile -Command "Start-Sleep -Milliseconds 500; (Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*server\static.cjs*' } | Select-Object -First 1).ProcessId" >> "logs\pids.txt" 2>nul

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
