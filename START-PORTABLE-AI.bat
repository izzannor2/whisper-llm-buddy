@echo off
rem Compatibility entry point; implementation lives in scripts\runtime.ps1.
call "%~dp0scripts\dispatch.bat" start  %*
exit /b %errorlevel%
