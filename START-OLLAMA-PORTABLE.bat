@echo off
setlocal enabledelayedexpansion
title AI Companion Hub - Portable Ollama
color 0B

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"

echo.
echo  ==========================================
echo    Portable Ollama
echo  ==========================================
echo    Models dir: %PROJECT_ROOT%\.ollama
echo    Host:       127.0.0.1:11434
echo  ==========================================
echo.

if not exist ".ollama" mkdir ".ollama"

set "OLLAMA_MODELS=%PROJECT_ROOT%\.ollama"
set "OLLAMA_HOST=127.0.0.1:11434"

if exist "bin\ollama\ollama.exe" (
    echo  [*] Starting portable Ollama...
    "bin\ollama\ollama.exe" serve
) else (
    where ollama >nul 2>&1
    if not errorlevel 1 (
        echo  [*] Starting system Ollama with portable model dir...
        ollama serve
    ) else (
        echo  [ERROR] Ollama not found.
        echo  Place ollama.exe in bin\ollama\ or install Ollama,
        echo  then re-run this script.
        pause & exit /b 1
    )
)
endlocal
