@echo off
setlocal enabledelayedexpansion
title AI Companion Hub - Repair
color 0E

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"

echo.
echo  ==========================================
echo    AI Companion Hub - REPAIR
echo  ==========================================
echo    1. Clears Vite cache (node_modules\.vite)
echo    2. Clears stale dist\.vite
echo    3. Clears stale logs\pids.txt
echo    4. Optional: reinstall + rebuild
echo  ==========================================
echo.

echo  [*] Removing node_modules\.vite ...
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite" 2>nul
echo  [*] Removing dist\.vite ...
if exist "dist\.vite" rmdir /s /q "dist\.vite" 2>nul
echo  [*] Removing logs\pids.txt ...
if exist "logs\pids.txt" del /f /q "logs\pids.txt" 2>nul

echo.
set /p REBUILD="Re-run prepare-usb.bat (npm install + build)? [y/N]: "
if /i "!REBUILD!"=="y" (
    if exist "scripts\prepare-usb.bat" (
        call "scripts\prepare-usb.bat"
    ) else (
        echo  [WARN] scripts\prepare-usb.bat not found - skipping rebuild
    )
)

echo.
echo  [DONE] Repair complete. Launch with START-PORTABLE-AI.bat
echo.
pause
endlocal
