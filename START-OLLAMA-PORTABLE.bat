@echo off
rem Compatibility entry point; implementation lives in scripts\runtime.ps1.
call "%~dp0scripts\dispatch.bat" start -Service ollama %*
exit /b %errorlevel%
