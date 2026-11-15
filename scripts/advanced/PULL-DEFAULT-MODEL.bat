@echo off
rem Compatibility entry point; implementation lives in scripts\runtime.ps1.
call "%~dp0..\dispatch.bat" pull  %*
exit /b %errorlevel%
