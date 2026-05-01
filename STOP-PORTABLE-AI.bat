@echo off
setlocal
title AI Companion Hub - Stop
color 0C

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"

if exist "stop-offline.bat" (
    call "%PROJECT_ROOT%\stop-offline.bat"
) else (
    echo [ERROR] stop-offline.bat not found in %PROJECT_ROOT%
    pause
    exit /b 1
)
endlocal
