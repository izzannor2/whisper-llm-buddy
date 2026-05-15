@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
title Verify Links
set "FAIL=0"
set "WARN=0"

echo ============================================================
echo  VERIFY LINKS - static wiring check (read-only)
echo ============================================================

echo.
echo  --- Directories ---
call :check_dir .ollama
call :check_dir models\gguf
call :check_dir logs
call :check_dir config
call :check_dir bin\node
call :check_dir bin\ollama
call :check_dir bin\llama
call :check_dir public\updates
call :check_dir projects\3d

echo.
echo  --- Required files ---
call :check_file config\settings.json
call :check_file server\index.cjs
call :check_file server\static.cjs
call :check_file package.json
call :check_file RUN-ALL.bat
call :check_file scripts\acceptance.bat
call :check_file scripts\advanced\PULL-DEFAULT-MODEL.bat

echo.
echo  --- Node.js ---
set "NODE_FOUND=0"
if exist "bin\node\node.exe" (
    echo  [PASS] portable Node at bin\node\node.exe
    set "NODE_FOUND=1"
)
where node >nul 2>&1
if not errorlevel 1 (
    echo  [PASS] system Node on PATH
    set "NODE_FOUND=1"
)
if "!NODE_FOUND!"=="0" ( echo  [FAIL] no Node.js found ^(portable or system^) & set /a FAIL+=1 )

echo.
echo  --- Ollama ---
set "OLLAMA_FOUND=0"
if exist "bin\ollama\ollama.exe" (
    echo  [PASS] portable Ollama at bin\ollama\ollama.exe
    set "OLLAMA_FOUND=1"
)
where ollama >nul 2>&1
if not errorlevel 1 (
    echo  [PASS] system Ollama on PATH
    set "OLLAMA_FOUND=1"
)
if "!OLLAMA_FOUND!"=="0" ( echo  [WARN] Ollama not installed ^(optional^) & set /a WARN+=1 )

echo.
echo  --- llama.cpp ---
if exist "bin\llama\llama-server.exe" (
    echo  [PASS] llama-server.exe present
) else (
    echo  [WARN] bin\llama\llama-server.exe missing ^(optional - only for GGUF^)
    set /a WARN+=1
)
set "GGUF_FOUND=0"
for /r "models\gguf" %%f in (*.gguf) do (
    if "!GGUF_FOUND!"=="0" echo  [PASS] GGUF model: %%~nxf
    set "GGUF_FOUND=1"
)
if "!GGUF_FOUND!"=="0" ( echo  [INFO] no .gguf files in models\gguf ^(optional^) )

echo.
echo  --- Path consistency with config\settings.json ---
if exist "config\settings.json" (
    where powershell >nul 2>&1
    if not errorlevel 1 (
        for /f "delims=" %%V in ('powershell -NoProfile -Command "(Get-Content config\settings.json -Raw | ConvertFrom-Json).model_path"') do set "CFG_MODEL_PATH=%%V"
        if /I "!CFG_MODEL_PATH!"=="./.ollama" (
            echo  [PASS] settings.model_path = ./.ollama  ^(matches RUN-ALL.bat^)
        ) else (
            echo  [FAIL] settings.model_path = !CFG_MODEL_PATH! ^(should be ./.ollama^)
            set /a FAIL+=1
        )
        for /f "delims=" %%V in ('powershell -NoProfile -Command "(Get-Content config\settings.json -Raw | ConvertFrom-Json).default_model"') do set "CFG_DEFAULT=%%V"
        if /I "!CFG_DEFAULT!"=="qwen2.5:3b" (
            echo  [PASS] settings.default_model = qwen2.5:3b
        ) else (
            echo  [WARN] settings.default_model = !CFG_DEFAULT! ^(expected qwen2.5:3b^)
            set /a WARN+=1
        )
    ) else (
        echo  [WARN] powershell not available - cannot validate config JSON
        set /a WARN+=1
    )
) else (
    echo  [FAIL] config\settings.json missing
    set /a FAIL+=1
)

echo.
echo  --- Ports ---
call :check_port 8080 web
call :check_port 3847 agent
call :check_port 11434 ollama
call :check_port 8081 llama-server

echo.
echo ============================================================
if "!FAIL!"=="0" (
    echo  RESULT: PASS   ^(warnings: !WARN!^)
    exit /b 0
) else (
    echo  RESULT: FAIL   ^(fails: !FAIL!  warnings: !WARN!^)
    exit /b 1
)

:check_file
if exist "%~1" ( echo  [PASS] %~1 ) else ( echo  [FAIL] missing: %~1 & set /a FAIL+=1 )
exit /b 0

:check_dir
if exist "%~1\" ( echo  [PASS] dir: %~1 ) else ( echo  [WARN] dir missing: %~1 ^(will be created on first run^) & set /a WARN+=1 )
exit /b 0

:check_port
netstat -ano | findstr ":%~1 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo  [INFO] :%~1 ^(%~2^) free
) else (
    echo  [INFO] :%~1 ^(%~2^) already LISTENING
)
exit /b 0
