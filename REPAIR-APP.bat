@echo off
setlocal
title AI Companion Hub - Repair
color 0E

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"

echo.
echo  ==========================================
echo    AI Companion Hub - REPAIR
echo  ==========================================
echo.

echo  [*] Clearing Vite caches...
if exist "node_modules\.vite"    rmdir /s /q "node_modules\.vite"
if exist "node_modules\.cache"   rmdir /s /q "node_modules\.cache"
if exist "dist\.vite"            rmdir /s /q "dist\.vite"
echo  [OK] Vite caches cleared.

echo  [*] Clearing stale PID tracker...
if exist "logs\pids.txt" del /f /q "logs\pids.txt"
echo  [OK] PID tracker cleared.

echo.
set /p REINSTALL="Reinstall node_modules (npm install)? [y/N]: "
if /i "%REINSTALL%"=="y" (
    if exist "node_modules" (
        echo  [*] Removing node_modules ...
        rmdir /s /q node_modules
    )
    echo  [*] Running npm install ...
    call npm install
)

echo.
echo  [DONE] Repair complete. Launch with START-PORTABLE-AI.bat
echo.
pause
endlocal
