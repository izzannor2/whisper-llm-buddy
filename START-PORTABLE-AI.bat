@echo off
setlocal enabledelayedexpansion
title AI Companion Hub - Portable
color 0A

:: ====================================================
:: Friend-ready entry point. Works from ANY drive/USB.
:: Resolves project root via %~dp0 (no hardcoded paths).
:: ====================================================
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"

echo.
echo  ==========================================
echo    AI Companion Hub - PORTABLE LAUNCHER
echo  ==========================================
echo    Project: %PROJECT_ROOT%
echo  ==========================================
echo.

:: Self-heal portable folders (per spec)
for %%D in (.ollama models\gguf models\ollama public\updates logs config bin\node bin\ollama bin\llama) do (
    if not exist "%%D" mkdir "%%D" 2>nul
)

:: Portable Ollama model storage (per spec)
set "OLLAMA_MODELS=%PROJECT_ROOT%\.ollama"
set "OLLAMA_HOST=127.0.0.1:11434"

if not exist "start-offline.bat" (
    echo  [ERROR] start-offline.bat missing in %PROJECT_ROOT%
    echo  Copy the full project folder, then retry.
    pause & exit /b 1
)

:: Delegate to the hardened offline launcher
call "%PROJECT_ROOT%\start-offline.bat"
endlocal
