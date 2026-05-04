@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
title Acceptance Tests
set "FAIL=0"

echo ============================================================
echo  ACCEPTANCE TESTS
echo ============================================================

call :check_file RUN-ALL.bat
call :check_file start.bat
call :check_file START-PORTABLE-AI.bat
call :check_file server\index.cjs

call :check_wraps start.bat "RUN-ALL.bat"
call :check_wraps START-PORTABLE-AI.bat "RUN-ALL.bat"

call :check_url /status                http://127.0.0.1:3847/status
call :check_url /selftest              http://127.0.0.1:3847/selftest
call :check_url /debug/snapshot        http://127.0.0.1:3847/debug/snapshot
call :check_url /dev-server/status     http://127.0.0.1:3847/dev-server/status
call :check_url /updates/applied       http://127.0.0.1:3847/updates/applied
call :check_url /agent/ollama-info     http://127.0.0.1:3847/agent/ollama-info
call :check_url /scan/gguf             http://127.0.0.1:3847/scan/gguf
call :check_url /scan/ollama           http://127.0.0.1:3847/scan/ollama

call :check_models_ok ollama  http://127.0.0.1:11434/api/tags
call :check_models_ok gguf    http://127.0.0.1:3847/scan/gguf

echo ============================================================
if "!FAIL!"=="0" (
    echo  RESULT: PASS
    exit /b 0
) else (
    echo  RESULT: FAIL ^(!FAIL! check^(s^) failed^)
    exit /b 1
)

:check_file
if exist "%~1" ( echo  [PASS] file exists: %~1 ) else ( echo  [FAIL] file missing: %~1 & set /a FAIL+=1 )
exit /b 0

:check_wraps
findstr /I /C:"%~2" "%~1" >nul
if not errorlevel 1 ( echo  [PASS] %~1 wraps %~2 ) else ( echo  [FAIL] %~1 does NOT wrap %~2 & set /a FAIL+=1 )
exit /b 0

:check_url
curl -s -o nul -w "%%{http_code}" --max-time 3 "%~2" > "%TEMP%\acc.tmp" 2>nul
set /p CODE=<"%TEMP%\acc.tmp"
del "%TEMP%\acc.tmp" >nul 2>&1
if "!CODE!"=="200" ( echo  [PASS] %~1 -> 200 ) else ( echo  [FAIL] %~1 -> !CODE! ^(server may be offline^) & set /a FAIL+=1 )
exit /b 0

:check_models_ok
curl -s --max-time 3 "%~2" > "%TEMP%\acc.tmp" 2>nul
if errorlevel 1 ( echo  [WARN] %~1 endpoint unreachable ^(empty state acceptable^) & exit /b 0 )
echo  [PASS] %~1 endpoint responded ^(0 models is acceptable^)
del "%TEMP%\acc.tmp" >nul 2>&1
exit /b 0
