@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
title Acceptance Tests
set "FAIL=0"
set "DO_BUILD=0"
if /I "%~1"=="--build" set "DO_BUILD=1"

echo ============================================================
echo  ACCEPTANCE TESTS  (use --build to also run npm run build)
echo ============================================================

echo.
echo  --- UI checks ---
call :check_file RUN-ALL.bat
call :check_file start.bat
call :check_file START-PORTABLE-AI.bat
call :check_file vite.config.ts
call :check_file src\components\settings\UpdatesPanel.tsx
call :check_file src\components\settings\DiagnosticsPanel.tsx
call :check_file src\components\ide\PreviewHealthCard.tsx
call :check_file src\pages\ThreeDWorkspace.tsx
call :check_file src\components\threed\AcceptanceChecklist.tsx
call :check_wraps start.bat "RUN-ALL.bat"
call :check_wraps START-PORTABLE-AI.bat "RUN-ALL.bat"

echo.
echo  --- Agent checks ---
call :check_file server\index.cjs
call :check_url /status                http://127.0.0.1:3847/status
call :check_url /selftest              http://127.0.0.1:3847/selftest
call :check_url /debug/snapshot        http://127.0.0.1:3847/debug/snapshot
call :check_url /debug/bundle          http://127.0.0.1:3847/debug/bundle
call :check_url /agent/ollama-info     http://127.0.0.1:3847/agent/ollama-info

echo.
echo  --- Model checks ---
call :check_file src\lib\model-registry.ts
call :check_file src\lib\model-routing.ts
call :check_url /scan/ollama           http://127.0.0.1:3847/scan/ollama
call :check_url /scan/gguf             http://127.0.0.1:3847/scan/gguf
call :check_url /scan/llama-server     http://127.0.0.1:3847/scan/llama-server
call :check_models_ok ollama  http://127.0.0.1:11434/api/tags
call :check_models_ok gguf    http://127.0.0.1:3847/scan/gguf

echo.
echo  --- Preview checks ---
call :check_url /dev-server/status     http://127.0.0.1:3847/dev-server/status
call :check_url /updates/applied       http://127.0.0.1:3847/updates/applied

echo.
echo  --- 3D checks ---
call :check_url /3d/status             http://127.0.0.1:3847/3d/status
call :check_url /3d/diagnostics        http://127.0.0.1:3847/3d/diagnostics
call :check_url /openscad/status       http://127.0.0.1:3847/openscad/status
call :check_save_scad
call :check_render_stl
call :check_export_stl

echo.
echo  --- Update checks ---
call :check_file src\lib\update-system.ts
call :check_file public\updates\manifest.json

echo.
echo  --- Default purity checks (no cloud/Gemini/llama-3.2 leaks) ---
call :check_no_leak src\lib\chat-api.ts        "backend: 'cloud'"
call :check_no_leak src\lib\chat-api.ts        "model: 'gemini-flash'"
call :check_no_leak src\components\ChatInput.tsx        "selectedModel = 'llama-3.2-1b'"
call :check_no_leak src\components\VoiceCallMode.tsx    "useState('gemini-flash')"

if "!DO_BUILD!"=="1" (
    echo.
    echo  [ ] running: npm run build  ^(may take a minute^)
    call npm run build >"%TEMP%\acc-build.log" 2>&1
    if errorlevel 1 (
        echo  [FAIL] npm run build failed - see "%TEMP%\acc-build.log"
        set /a FAIL+=1
    ) else (
        echo  [PASS] npm run build
    )
)

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

:check_save_scad
set "BODY={\"scad\":\"cube(10);\",\"name\":\"acceptance_test\"}"
curl -s -o nul -w "%%{http_code}" --max-time 5 -H "content-type: application/json" -d "!BODY!" "http://127.0.0.1:3847/3d/save-scad" > "%TEMP%\acc.tmp" 2>nul
set /p CODE=<"%TEMP%\acc.tmp"
del "%TEMP%\acc.tmp" >nul 2>&1
if "!CODE!"=="200" (
    if exist "projects\3d\acceptance_test\model.scad" (
        echo  [PASS] /3d/save-scad -> 200 ^(model.scad written^)
    ) else (
        echo  [FAIL] /3d/save-scad -> 200 but model.scad missing & set /a FAIL+=1
    )
) else (
    echo  [FAIL] /3d/save-scad -> !CODE! & set /a FAIL+=1
)
exit /b 0

:check_render_stl
:: 200 = OpenSCAD present and rendered. 422 = CLI absent (expected, NO fake STL).
if exist "projects\3d\acceptance_test\model.stl" del "projects\3d\acceptance_test\model.stl" >nul 2>&1
set "BODY={\"scad\":\"cube(10);\",\"name\":\"acceptance_test\"}"
curl -s -o nul -w "%%{http_code}" --max-time 30 -H "content-type: application/json" -d "!BODY!" "http://127.0.0.1:3847/openscad/render" > "%TEMP%\acc.tmp" 2>nul
set /p CODE=<"%TEMP%\acc.tmp"
del "%TEMP%\acc.tmp" >nul 2>&1
if "!CODE!"=="200" (
    echo  [PASS] /openscad/render -> 200 ^(OpenSCAD CLI present^)
) else if "!CODE!"=="422" (
    if exist "projects\3d\acceptance_test\model.stl" (
        echo  [FAIL] /openscad/render -> 422 but fake STL was created & set /a FAIL+=1
    ) else (
        echo  [PASS] /openscad/render -> 422 ^(CLI missing, no fake STL - expected^)
    )
) else (
    echo  [FAIL] /openscad/render -> !CODE! & set /a FAIL+=1
)
exit /b 0

:check_no_leak
findstr /C:"%~2" "%~1" >nul 2>&1
if errorlevel 1 ( echo  [PASS] no leak in %~1: "%~2" ) else ( echo  [FAIL] LEAK in %~1: "%~2" & set /a FAIL+=1 )
exit /b 0

:check_export_stl
set "BODY={\"scad\":\"cube(10);\",\"name\":\"acceptance_test\"}"
curl -s -o nul -w "%%{http_code}" --max-time 30 -H "content-type: application/json" -d "!BODY!" "http://127.0.0.1:3847/3d/export-stl" > "%TEMP%\acc.tmp" 2>nul
set /p CODE=<"%TEMP%\acc.tmp"
del "%TEMP%\acc.tmp" >nul 2>&1
if "!CODE!"=="200" ( echo  [PASS] /3d/export-stl -> 200 ) else if "!CODE!"=="422" ( echo  [PASS] /3d/export-stl -> 422 ^(CLI missing, expected^) ) else ( echo  [FAIL] /3d/export-stl -> !CODE! & set /a FAIL+=1 )
exit /b 0
