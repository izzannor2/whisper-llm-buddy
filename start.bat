@echo off
setlocal enabledelayedexpansion
title LocalDev AI - Development Server
color 0A

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         LocalDev AI - Quick Start        ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ========================================
:: Step 1: Check Node.js
:: ========================================
echo [1/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo       [!] Node.js not found - attempting auto-install...
    echo.

    :: Try winget first
    where winget >nul 2>&1
    if not errorlevel 1 (
        echo       [*] Installing Node.js via winget...
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        goto :refresh_path
    )

    :: Fallback: download MSI via curl
    where curl >nul 2>&1
    if not errorlevel 1 (
        echo       [*] Downloading Node.js installer...
        curl -L -o "%TEMP%\nodejs_install.msi" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
        if exist "%TEMP%\nodejs_install.msi" (
            echo       [*] Installing Node.js silently...
            msiexec /i "%TEMP%\nodejs_install.msi" /quiet /qn /norestart
            del "%TEMP%\nodejs_install.msi" 2>nul
            goto :refresh_path
        )
    )

    echo.
    echo  [ERROR] Could not auto-install Node.js!
    echo  Please install manually from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
goto :node_ok

:refresh_path
:: Refresh PATH to pick up newly installed Node.js
set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
for /f "delims=" %%P in ('where node 2^>nul') do set "PATH=%%~dpP;%PATH%"
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js install completed but 'node' not found in PATH.
    echo  Please restart your terminal or install manually: https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo       [OK] Node.js installed successfully!

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
:: Step 3: Install dependencies (with retry + auto-repair)
:: ========================================
echo [3/5] Checking dependencies...

:: Auto-repair corrupted node_modules
if exist "node_modules" (
    if not exist "node_modules\react" (
        echo       [!] node_modules appears corrupted, reinstalling...
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
                echo       [!] Attempt %%A failed, retrying in 3s...
                timeout /t 3 /nobreak >nul
            )
        )
    )
    if !INSTALL_SUCCESS!==0 (
        echo.
        echo  [ERROR] Failed to install dependencies after 3 attempts!
        pause
        exit /b 1
    )
    echo       [OK] Dependencies installed
) else (
    echo       [OK] Dependencies already installed
)

:: ========================================
:: Step 4: Setup directories + detect models
:: ========================================
echo [4/5] Setting up environment...
if not exist "models\gguf" mkdir "models\gguf" 2>nul
if not exist "bin\llama" mkdir "bin\llama" 2>nul
if not exist "bin\ollama" mkdir "bin\ollama" 2>nul

set LLAMA_SERVER_CMD=
set OLLAMA_CMD=
set LLAMA_SERVER_RUNNING=0

:: Check llama-server
if exist "bin\llama\llama-server.exe" (
    set "LLAMA_SERVER_CMD=bin\llama\llama-server.exe"
    echo       [OK] Found local llama-server
) else (
    where llama-server >nul 2>&1
    if not errorlevel 1 set "LLAMA_SERVER_CMD=llama-server"
)

:: Check Ollama
if exist "bin\ollama\ollama.exe" (
    set "OLLAMA_CMD=bin\ollama\ollama.exe"
    echo       [OK] Found local Ollama
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

:: Start llama-server if model found
if defined GGUF_MODEL (
    echo       [*] Found model: !GGUF_MODEL!
    if defined LLAMA_SERVER_CMD (
        curl -s http://localhost:8081/health >nul 2>&1
        if errorlevel 1 (
            echo       [*] Starting llama-server...
            start /B "LlamaServer" !LLAMA_SERVER_CMD! -m "!GGUF_MODEL!" --port 8081 --host 0.0.0.0 -ngl 99 >nul 2>&1
            :: Health check with retry
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

:: Start Ollama if no llama-server
if !LLAMA_SERVER_RUNNING!==0 (
    if defined OLLAMA_CMD (
        curl -s http://localhost:11434/api/tags >nul 2>&1
        if errorlevel 1 (
            echo       [*] Starting Ollama...
            set "OLLAMA_HOST=127.0.0.1:11434"
            start "" /B cmd /c "set OLLAMA_HOST=127.0.0.1:11434 && "!OLLAMA_CMD!" serve"
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
        echo       [*] No local LLM found - using Cloud backend
    )
)
:ollama_done

:: ========================================
:: Step 5: Start dev server
:: ========================================
echo [5/5] Starting development server...
echo.
echo ══════════════════════════════════════════
echo  App: http://localhost:8080
if defined GGUF_MODEL echo  LLM: llama-server ^(port 8081^)
echo  Press Ctrl+C to stop
echo ══════════════════════════════════════════
echo.

:: Open browser
start /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:8080"

:: Start dev server
!PKG_CMD! run dev

endlocal
