@echo off
setlocal enabledelayedexpansion
title LocalDev AI - Stop Offline Services
color 0C

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo.
echo  Stopping LocalDev AI offline services...
echo.

if not exist "logs\pids.txt" (
    echo  [INFO] No logs\pids.txt found - nothing to stop.
    echo  (start-offline.bat was not run, or already stopped)
    echo.
    pause & exit /b 0
)

set "STOPPED=0"
for /f "usebackq tokens=* eol=#" %%P in ("logs\pids.txt") do (
    set "PID=%%P"
    if not "!PID!"=="" (
        :: Verify PID is purely numeric before killing
        set "NONNUM="
        for /f "delims=0123456789" %%X in ("!PID!") do set "NONNUM=1"
        if not defined NONNUM (
            taskkill /F /PID !PID! >nul 2>&1
            if not errorlevel 1 (
                echo  [OK] Killed PID !PID!
                set /a STOPPED+=1
            ) else (
                echo  [--] PID !PID! already gone
            )
        )
    )
)

del "logs\pids.txt" 2>nul
echo.
echo  Stopped !STOPPED! tracked process(es).
echo  Other ollama/node processes on this PC were left untouched.
echo.
pause
endlocal
