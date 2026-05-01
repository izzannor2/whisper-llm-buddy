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

if not exist "models\gguf" mkdir "models\gguf"

:: Recursive search for llama-server.exe under bin\llama
set "LLAMA_BIN="
for /r "bin\llama" %%f in (llama-server.exe) do (
    if not defined LLAMA_BIN set "LLAMA_BIN=%%~ff"
)

if not defined LLAMA_BIN (
    echo  [INFO] llama-server.exe not found under bin\llama\
    echo  GGUF inference is OPTIONAL. Drop llama-server.exe anywhere
    echo  inside bin\llama\ to enable it, or just use Ollama instead.
    pause & exit /b 0
)

:: Recursive search for first .gguf under models\gguf
set "GGUF_MODEL="
for /r "models\gguf" %%f in (*.gguf) do (
    if not defined GGUF_MODEL set "GGUF_MODEL=%%~ff"
)

if not defined GGUF_MODEL (
    echo  [INFO] No .gguf files found under models\gguf\
    echo  Drop a quantized model (e.g. Q4_K_M.gguf) and retry.
    pause & exit /b 0
)

echo  [OK] llama-server: !LLAMA_BIN!
echo  [OK] Model:        !GGUF_MODEL!
echo  [*]  Starting on http://127.0.0.1:8081 ...
echo.
"!LLAMA_BIN!" -m "!GGUF_MODEL!" --port 8081 --host 127.0.0.1 -ngl 99
endlocal
