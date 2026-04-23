@echo off
setlocal enabledelayedexpansion
title LocalDev AI - Prepare USB (one-time)
color 0E

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."
set "ROOT=%CD%"

echo.
echo  ==========================================
echo   LocalDev AI - Prepare Portable USB Build
echo  ==========================================
echo  This downloads Node.js + Ollama into bin\,
echo  installs deps, builds the app, and pulls
echo  a default model. Run this ONCE on a PC
echo  that has internet, then copy the whole
echo  folder to your USB drive.
echo  ==========================================
echo.

:: Ensure dirs
for %%D in (bin\node bin\ollama bin\llama models\gguf models\ollama logs config dist) do (
    if not exist "%%D" mkdir "%%D" 2>nul
)

:: ============================================================
:: Step 1: Portable Node.js
:: ============================================================
echo [1/5] Portable Node.js...
if exist "bin\node\node.exe" (
    echo       [OK] Already present
) else (
    set "NODE_URL=https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
    set "NODE_ZIP=%TEMP%\node-portable.zip"
    echo       [*] Downloading Node.js 20 LTS...
    powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '!NODE_URL!' -OutFile '!NODE_ZIP!' -UseBasicParsing } catch { exit 1 }"
    if errorlevel 1 (
        echo       [ERROR] Download failed. Check internet and retry.
        pause & exit /b 1
    )
    echo       [*] Extracting...
    powershell -NoProfile -Command "Expand-Archive -Path '!NODE_ZIP!' -DestinationPath '%TEMP%\node-extract' -Force"
    for /d %%D in ("%TEMP%\node-extract\node-*") do (
        xcopy /E /I /Y /Q "%%D\*" "bin\node\" >nul
    )
    rmdir /s /q "%TEMP%\node-extract" 2>nul
    del "!NODE_ZIP!" 2>nul
    if exist "bin\node\node.exe" (
        echo       [OK] Installed
    ) else (
        echo       [ERROR] Extraction failed
        pause & exit /b 1
    )
)
set "PATH=%ROOT%\bin\node;%PATH%"
for /f "tokens=*" %%v in ('"bin\node\node.exe" --version') do echo       Version: %%v

:: ============================================================
:: Step 2: Portable Ollama
:: ============================================================
echo [2/5] Portable Ollama...
if exist "bin\ollama\ollama.exe" (
    echo       [OK] Already present
) else (
    set "OLLAMA_URL=https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip"
    set "OLLAMA_ZIP=%TEMP%\ollama-portable.zip"
    echo       [*] Downloading Ollama (Windows amd64)...
    powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '!OLLAMA_URL!' -OutFile '!OLLAMA_ZIP!' -UseBasicParsing } catch { exit 1 }"
    if errorlevel 1 (
        echo       [!] Download failed - skipping Ollama (you can add it later)
    ) else (
        echo       [*] Extracting...
        powershell -NoProfile -Command "Expand-Archive -Path '!OLLAMA_ZIP!' -DestinationPath 'bin\ollama' -Force"
        del "!OLLAMA_ZIP!" 2>nul
        if exist "bin\ollama\ollama.exe" (
            echo       [OK] Installed
        ) else (
            echo       [!] Extraction failed - Ollama optional, continuing
        )
    )
)

:: ============================================================
:: Step 3: npm ci (or install)
:: ============================================================
echo [3/5] Installing npm packages with portable Node...
if exist "node_modules\react" (
    echo       [OK] node_modules already present
) else (
    if exist "package-lock.json" (
        call "bin\node\npm.cmd" ci
    ) else (
        call "bin\node\npm.cmd" install
    )
    if errorlevel 1 (
        echo       [ERROR] npm install failed
        pause & exit /b 1
    )
    echo       [OK] Dependencies installed
)

:: ============================================================
:: Step 4: Build dist/
:: ============================================================
echo [4/5] Building production bundle...
call "bin\node\npm.cmd" run build
if errorlevel 1 (
    echo       [ERROR] Build failed
    pause & exit /b 1
)
if exist "dist\index.html" (
    echo       [OK] dist\ ready
) else (
    echo       [ERROR] dist\index.html not found after build
    pause & exit /b 1
)

:: ============================================================
:: Step 5: Pull default model into models\ollama
:: ============================================================
echo [5/5] Pulling default model llama3.2 into models\ollama...
if not exist "bin\ollama\ollama.exe" (
    echo       [*] Skipping - Ollama not installed
    goto :done
)
set "OLLAMA_MODELS=%ROOT%\models\ollama"
set "OLLAMA_HOST=127.0.0.1:11434"

:: Start Ollama if not running
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo       [*] Starting Ollama...
    start "" /B "bin\ollama\ollama.exe" serve >nul 2>&1
    for /l %%i in (1,1,15) do (
        curl -s http://localhost:11434/api/tags >nul 2>&1
        if not errorlevel 1 goto :ollama_up
        timeout /t 1 /nobreak >nul
    )
    echo       [!] Ollama did not start - skipping model pull
    goto :done
)
:ollama_up
echo       [*] Pulling llama3.2 (this may take several minutes)...
"bin\ollama\ollama.exe" pull llama3.2
if errorlevel 1 (
    echo       [!] Model pull failed - you can pull manually later
) else (
    echo       [OK] Model llama3.2 stored in models\ollama
)

:done
echo.
echo  ==========================================
echo   USB BUILD READY
echo  ==========================================
echo   Now copy this entire folder to your USB
echo   drive. On any Windows PC, double-click:
echo.
echo       start-offline.bat
echo.
echo   No installs needed on the host machine.
echo  ==========================================
echo.
pause
endlocal
