@echo off
setlocal enabledelayedexpansion
title LocalDev AI - Development Server
color 0A

:: ========================================
:: USB-Safe: resolve script directory
:: ========================================
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Set portable model storage (prefer .ollama, fall back to legacy models\ollama)
if exist "%SCRIPT_DIR%.ollama" (
    set "OLLAMA_MODELS=%SCRIPT_DIR%.ollama"
) else (
    set "OLLAMA_MODELS=%SCRIPT_DIR%models\ollama"
)

echo.
echo  ==========================================
echo         LocalDev AI - Quick Start
echo  ==========================================
echo  TIP: For pure offline USB usage, run
echo       start-offline.bat instead (no internet
echo       required, uses portable bin\ binaries).
echo.

:: Ensure directories exist (self-healing)
for %%D in (config logs models\gguf models\ollama .ollama public\updates bin\llama bin\ollama) do (
    if not exist "%%D" mkdir "%%D" 2>nul
)

:: Create default config if missing
if not exist "config\settings.json" (
    (
        echo {
        echo   "ollama_path": "./bin/ollama",
        echo   "llama_path": "./bin/llama",
        echo   "model_path": "./models",
        echo   "log_path": "./logs",
        echo   "auto_start_ollama": true,
        echo   "default_model": "llama3.2",
        echo   "ollama_port": 11434,
        echo   "llama_port": 8081,
        echo   "app_port": 8080
        echo }
    ) > "config\settings.json"
)

:: Start logging
echo [%date% %time%] === LocalDev AI Starting === >> "logs\app.log"

:: ========================================
:: Step 1: Check Node.js (portable first)
:: ========================================
echo [1/5] Checking Node.js...

if exist "bin\node\node.exe" (
    set "PATH=%SCRIPT_DIR%bin\node;%PATH%"
    echo       [OK] Using portable Node.js
    goto :node_ok
)

node --version >nul 2>&1
if not errorlevel 1 goto :node_found

echo       [!] Node.js not found - attempting auto-install...

where winget >nul 2>&1
if not errorlevel 1 (
    echo       [*] Installing Node.js via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    goto :refresh_path
)

where curl >nul 2>&1
if not errorlevel 1 (
    echo       [*] Downloading Node.js installer...
    curl -L -o "%TEMP%\nodejs_install.msi" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    if exist "%TEMP%\nodejs_install.msi" (
        msiexec /i "%TEMP%\nodejs_install.msi" /quiet /qn /norestart
        del "%TEMP%\nodejs_install.msi" 2>nul
        goto :refresh_path
    )
)

echo  [ERROR] Could not install Node.js!
echo  Place portable node.exe in bin\node\ or install from https://nodejs.org
pause
exit /b 1

:refresh_path
set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
for /f "delims=" %%P in ('where node 2^>nul') do set "PATH=%%~dpP;%PATH%"
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found after install. Restart terminal.
    pause
    exit /b 1
)
echo       [OK] Node.js installed!

:node_found
:node_ok
for /f "tokens=*" %%i in ('node --version') do echo       [OK] Node.js %%i

:: ========================================
:: Step 2: Detect package manager
:: ========================================
set PKG_CMD=npm
where bun >nul 2>&1
if not errorlevel 1 (
    set PKG_CMD=bun
    echo [2/5] [OK] Using Bun
) else (
    echo [2/5] [OK] Using npm
)

:: ========================================
:: Step 3: Dependencies (self-healing)
:: ========================================
echo [3/5] Checking dependencies...

:: Self-healing: check for corrupted node_modules
if exist "node_modules" (
    if not exist "node_modules\react" (
        echo       [!] node_modules corrupted, reinstalling...
        rmdir /s /q node_modules 2>nul
    )
    if not exist "node_modules\vite" (
        echo       [!] node_modules incomplete, reinstalling...
        rmdir /s /q node_modules 2>nul
    )
)

if not exist "node_modules" (
    set INSTALL_SUCCESS=0
    for /l %%A in (1,1,3) do (
        if !INSTALL_SUCCESS!==0 (
            echo       [*] Attempt %%A/3: !PKG_CMD! install...
            !PKG_CMD! install
            if not errorlevel 1 (
                set INSTALL_SUCCESS=1
            ) else (
                echo       [!] Attempt %%A failed, retrying...
                timeout /t 3 /nobreak >nul
            )
        )
    )
    if !INSTALL_SUCCESS!==0 (
        echo  [ERROR] Failed to install dependencies!
        echo [%date% %time%] FATAL: npm install failed >> "logs\app.log"
        pause
        exit /b 1
    )
    echo       [OK] Dependencies installed
) else (
    echo       [OK] Dependencies ready
)

:: ========================================
:: Step 4: Detect and start local AI servers
:: ========================================
echo [4/5] Setting up AI engines...

set LLAMA_SERVER_CMD=
set OLLAMA_CMD=
set LLAMA_SERVER_RUNNING=0

:: Check llama-server (portable first, then system)
if exist "bin\llama\llama-server.exe" (
    set "LLAMA_SERVER_CMD=%SCRIPT_DIR%bin\llama\llama-server.exe"
    echo       [OK] Found portable llama-server
) else (
    where llama-server >nul 2>&1
    if not errorlevel 1 set "LLAMA_SERVER_CMD=llama-server"
)

:: Check Ollama (portable first, then system)
if exist "bin\ollama\ollama.exe" (
    set "OLLAMA_CMD=%SCRIPT_DIR%bin\ollama\ollama.exe"
    echo       [OK] Found portable Ollama
) else (
    where ollama >nul 2>&1
    if not errorlevel 1 set "OLLAMA_CMD=ollama"
)

:: Check for GGUF models
set GGUF_MODEL=
if exist "models\gguf" (
    for %%f in (models\gguf\*.gguf) do (
        if not defined GGUF_MODEL set "GGUF_MODEL=%%f"
    )
)

:: Start llama-server if model found (check port not in use first)
if defined GGUF_MODEL (
    echo       [*] Found model: !GGUF_MODEL!
    if defined LLAMA_SERVER_CMD (
        curl -s http://localhost:8081/health >nul 2>&1
        if errorlevel 1 (
            echo       [*] Starting llama-server on port 8081...
            start /B "LlamaServer" !LLAMA_SERVER_CMD! -m "!GGUF_MODEL!" --port 8081 --host 0.0.0.0 -ngl 99 >nul 2>&1
            echo [%date% %time%] Started llama-server with !GGUF_MODEL! >> "logs\app.log"
            for /l %%i in (1,1,10) do (
                curl -s http://localhost:8081/health >nul 2>&1
                if not errorlevel 1 (
                    echo       [OK] llama-server ready on port 8081
                    set LLAMA_SERVER_RUNNING=1
                    goto :llama_done
                )
                timeout /t 1 /nobreak >nul
            )
            echo       [!] llama-server may still be loading...
            set LLAMA_SERVER_RUNNING=1
        ) else (
            echo       [OK] llama-server already running
            set LLAMA_SERVER_RUNNING=1
        )
    )
)
:llama_done

:: Start Ollama if no llama-server (check port not in use first)
if !LLAMA_SERVER_RUNNING!==0 (
    if defined OLLAMA_CMD (
        curl -s http://localhost:11434/api/tags >nul 2>&1
        if errorlevel 1 (
            echo       [*] Starting Ollama...
            set "OLLAMA_HOST=127.0.0.1:11434"
            start "OLLAMA" /B cmd /c "set OLLAMA_HOST=127.0.0.1:11434& set OLLAMA_MODELS=!OLLAMA_MODELS!& "!OLLAMA_CMD!" serve"
            echo [%date% %time%] Started Ollama >> "logs\app.log"
            for /l %%i in (1,1,10) do (
                curl -s http://localhost:11434/api/tags >nul 2>&1
                if not errorlevel 1 (
                    echo       [OK] Ollama ready
                    goto :ollama_done
                )
                timeout /t 1 /nobreak >nul
            )
            echo       [!] Ollama may still be loading
        ) else (
            echo       [OK] Ollama running
        )
    ) else (
        echo       [*] No local AI engine found - using Cloud backend
    )
)
:ollama_done

:: ========================================
:: Step 5: Start dev server
:: ========================================
echo [5/5] Starting development server...
echo.
echo ==========================================
echo  App:     http://localhost:8080
if defined GGUF_MODEL echo  Llama:   http://localhost:8081
if defined OLLAMA_CMD echo  Ollama:  http://localhost:11434
echo  Models:  %SCRIPT_DIR%models\
echo  Logs:    %SCRIPT_DIR%logs\
echo  Press Ctrl+C to stop
echo ==========================================
echo.

echo [%date% %time%] App server starting on port 8080 >> "logs\app.log"

:: Open browser after delay
start /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:8080"

:: Start dev server
!PKG_CMD! run dev

endlocal
