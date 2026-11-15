@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
title Test All - full end-to-end verification
set "FAIL=0"
set "HUB_NO_PAUSE=1"

echo ============================================================
echo  TEST ALL - end-to-end verification
echo  Steps: verify-links -> RUN-ALL (if needed) -> acceptance -> route smoke
echo ============================================================

echo.
echo  [1/4] Static wiring check ^(scripts\verify-links.bat^)
call scripts\verify-links.bat
if errorlevel 1 (
    echo  [FAIL] verify-links reported failures
    set /a FAIL+=1
)

echo.
echo  [2/4] Ensuring services are running...
set "NEED_START=0"
curl -fsS --max-time 2 http://127.0.0.1:3847/status >nul 2>&1
if errorlevel 1 set "NEED_START=1"
curl -fsS --max-time 2 http://127.0.0.1:8080 >nul 2>&1
if errorlevel 1 set "NEED_START=1"
if "!NEED_START!"=="0" goto :ready
echo       [*] Launching RUN-ALL.bat in a new window...
start "RUN-ALL (test-all)" cmd /c "call RUN-ALL.bat -NoBrowser"
echo       [*] Waiting up to 90s for :3847 and :8080 ...
set "READY=0"
for /l %%i in (1,1,90) do (
    timeout /t 1 /nobreak >nul
    curl -fsS --max-time 1 http://127.0.0.1:3847/status >nul 2>&1
    if not errorlevel 1 (
        curl -fsS --max-time 1 http://127.0.0.1:8080 >nul 2>&1
        if not errorlevel 1 set "READY=1"
    )
    if "!READY!"=="1" goto :ready
)
echo  [FAIL] services did not come up within 90s
echo  [BLOCKED] Service checks skipped. See logs\run-all.log and logs\server.log.
exit /b 1

:ready
echo       [OK] services responding

echo.
echo  [3/4] Acceptance suite ^(--build^)
call scripts\acceptance.bat --build
if errorlevel 1 (
    echo  [FAIL] acceptance.bat reported failures
    set /a FAIL+=1
)

echo.
echo  [4/4] Route smoke test
call scripts\route-smoke-test.bat
if errorlevel 1 (
    echo  [FAIL] route-smoke-test reported failures
    set /a FAIL+=1
)

echo.
echo ============================================================
if "!FAIL!"=="0" (
    echo  TEST ALL RESULT: PASS
    exit /b 0
) else (
    echo  TEST ALL RESULT: FAIL  ^(!FAIL! step^(s^) failed^)
    exit /b 1
)
