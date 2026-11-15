@echo off
rem Compatibility entry point; implementation lives in scripts\runtime.ps1.
call "%~dp0dispatch.bat" check  %*
exit /b %errorlevel%
