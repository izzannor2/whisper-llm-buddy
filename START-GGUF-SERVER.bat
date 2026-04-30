@echo off
setlocal enabledelayedexpansion
title AI Companion Hub - GGUF Server (llama.cpp)
color 0D

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"

echo.
echo  ==========================================
echo    llama.cpp GGUF Server
echo  ==========================================
echo.

if not exist "bin\llama\llama-server.exe" (
    echo  [ERROR] bin\llama\llama-server.exe not found.
    echo  Download llama.cpp Windows release and place
    echo  llama-server.exe inside bin\llama\
    pause & exit /b 1
)

if not exist "models\gguf" mkdir "models\gguf"

set "GGUF_MODEL="
for %%f in ("models\gguf\*.gguf") do (
    if not defined GGUF_MODEL set "GGUF_MODEL=%%~ff"
)

if not defined GGUF_MODEL (
    echo  [ERROR] No .gguf files found in models\gguf\
    echo  Drop a quantized model (e.g. Q4_K_M.gguf) there and retry.
    pause & exit /b 1
)

echo  [OK] Model: !GGUF_MODEL!
echo  [*]  Starting on http://127.0.0.1:8081 ...
echo.
"bin\llama\llama-server.exe" -m "!GGUF_MODEL!" --port 8081 --host 127.0.0.1 -ngl 99
endlocal
