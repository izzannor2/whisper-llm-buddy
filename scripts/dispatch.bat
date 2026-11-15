@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0\.."
where powershell.exe >nul 2>&1
if errorlevel 1 goto :missing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime.ps1" -Action %*
set "RESULT=%errorlevel%"
if not "%RESULT%"=="0" echo [ERROR] Action failed. See logs\startup-errors.log and the action log.
if /I "%HUB_NO_PAUSE%"=="1" goto :done
echo.
pause
:done
endlocal & exit /b %RESULT%
:missing
echo [ERROR] Windows PowerShell is required. No services were started.
pause
endlocal & exit /b 1