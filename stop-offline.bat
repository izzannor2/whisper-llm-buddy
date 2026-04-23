@echo off
setlocal enabledelayedexpansion
title LocalDev AI - Stop Offline Services
color 0C

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo.
echo  Stopping LocalDev AI offline services...
echo.

:: Kill tracked PIDs first
if exist "logs\pids.txt" (
    for /f "usebackq tokens=*" %%P in ("logs\pids.txt") do (
        if not "%%P"=="" (
            taskkill /F /PID %%P >nul 2>&1
            if not errorlevel 1 echo  [OK] Killed PID %%P
        )
    )
    del "logs\pids.txt" 2>nul
)

:: Belt-and-suspenders: kill known process names
for %%N in (ollama.exe llama-server.exe) do (
    taskkill /F /IM %%N >nul 2>&1
    if not errorlevel 1 echo  [OK] Killed %%N
)

:: Kill node processes serving our scripts (match by command line)
powershell -NoProfile -Command "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*server\index.js*' -or $_.CommandLine -like '*server\static.cjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host ('  [OK] Killed node PID ' + $_.ProcessId) }"

echo.
echo  All offline services stopped.
echo.
pause
endlocal
