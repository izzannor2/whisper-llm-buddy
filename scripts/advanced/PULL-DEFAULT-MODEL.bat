@echo off
setlocal
title Pull Default Model (qwen2.5:3b)
cd /d "%~dp0\..\.."
set "PROJECT_ROOT=%CD%"
set "OLLAMA_MODELS=%PROJECT_ROOT%\.ollama"
set "OLLAMA_HOST=127.0.0.1:11434"

echo.
echo  ============================================================
echo    Pull Default Model - qwen2.5:3b
echo  ============================================================
echo    Models will be stored in: %OLLAMA_MODELS%
echo  ============================================================
echo.

set "OLLAMA_BIN="
if exist "bin\ollama\ollama.exe" set "OLLAMA_BIN=%PROJECT_ROOT%\bin\ollama\ollama.exe"
if not defined OLLAMA_BIN (
    where ollama >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Ollama not found. Install Ollama or run scripts\prepare-usb.bat
        pause
        exit /b 1
    )
    for /f "delims=" %%O in ('where ollama') do if not defined OLLAMA_BIN set "OLLAMA_BIN=%%O"
)

curl -s --max-time 2 http://127.0.0.1:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo [INFO] Ollama not running. Please start RUN-ALL.bat first, then re-run this script.
    pause
    exit /b 1
)

echo [..] Pulling qwen2.5:3b ^(this can take several minutes^)...
"%OLLAMA_BIN%" pull qwen2.5:3b
if errorlevel 1 (
    echo [ERROR] Pull failed. See output above.
    pause
    exit /b 1
)
echo [OK] qwen2.5:3b ready.
pause
endlocal
