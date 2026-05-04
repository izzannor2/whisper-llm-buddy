@echo off
REM Whole-app route smoke test (Windows wrapper).
cd /d "%~dp0\.."
node scripts/route-smoke-test.mjs %*
exit /b %ERRORLEVEL%
