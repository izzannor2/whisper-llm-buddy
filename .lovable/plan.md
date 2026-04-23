

# Reliable Offline Launcher — Preflight, Strict PIDs, Fixed .bat Syntax

Three surgical improvements to the USB offline launcher suite. No new files, no architecture changes.

## 1. `start-offline.bat` — Preflight check + syntax cleanup

**Problems in current file:**
- Background `start "TITLE" /B cmd /c "..."` with `&&` and embedded quotes is fragile under `cmd.exe` — the `set VAR=val&& cmd` chain frequently parses wrong because `&&` inside `start /B cmd /c "..."` is consumed by the outer shell, not the inner one. Ollama launch line is the worst offender.
- PID capture via `(Get-Process ollama | Select -First 1).Id` is racy — it grabs whatever ollama is already running on the host, not necessarily the one we just started.
- No port-conflict check before launching — if 8080/3847/11434 are already taken, services silently fail and only logs reveal it.
- No verification that `server/index.js` and `server/static.cjs` exist before launch.
- Empty initial line written to `logs\pids.txt` (`> "logs\pids.txt" echo.`) creates a stray blank PID that `stop-offline.bat` then tries to `taskkill` on.

**Fixes:**

### A. Add preflight block (after directory self-heal, before launching anything)

```bat
:: ----------------------------------------------------
:: PREFLIGHT — verify ports free + required files exist
:: ----------------------------------------------------
echo [0/4] Running preflight checks...
set "PREFLIGHT_FAIL=0"

:: Required files
for %%F in ("bin\node\node.exe" "server\index.js" "server\static.cjs" "dist\index.html") do (
    if not exist %%F (
        echo       [FAIL] Missing: %%F
        set "PREFLIGHT_FAIL=1"
    )
)

:: Port checks (8080 web, 3847 agent; 11434 only warn)
for %%P in (8080 3847) do (
    netstat -ano | findstr ":%%P " | findstr "LISTENING" >nul 2>&1
    if not errorlevel 1 (
        echo       [FAIL] Port %%P already in use
        set "PREFLIGHT_FAIL=1"
    )
)
netstat -ano | findstr ":11434 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 echo       [WARN] Port 11434 in use - will reuse existing Ollama

if "%PREFLIGHT_FAIL%"=="1" (
    echo.
    echo  [ERROR] Preflight failed. Fix issues above and retry.
    echo  - Run scripts\prepare-usb.bat to install missing files
    echo  - Run stop-offline.bat to free ports from a previous run
    pause & exit /b 1
)
echo       [OK] All checks passed
```

### B. Replace fragile Ollama launch with a clean wrapper

Use a tiny helper batch invocation that sets env vars in its own scope and writes its own PID to a file the parent reads. This avoids the `set X=Y&& exe` parsing trap entirely:

```bat
if exist "bin\ollama\ollama.exe" (
    curl -s http://localhost:11434/api/tags >nul 2>&1
    if errorlevel 1 (
        echo [2/4] [*] Starting portable Ollama...
        :: Launch in own cmd with proper env scope; write PID after launch
        start "OLLAMA" /B cmd /c "set OLLAMA_MODELS=%ROOT%\models\ollama& set OLLAMA_HOST=127.0.0.1:11434& bin\ollama\ollama.exe serve >> logs\ollama.log 2>&1"
        :: Wait, then capture the actual PID we just spawned (newest ollama.exe)
        timeout /t 1 /nobreak >nul
        for /f "tokens=2" %%P in ('tasklist /FI "IMAGENAME eq ollama.exe" /NH ^| sort /R') do (
            echo %%P>> "logs\pids.txt"
            goto :ollama_pid_done
        )
        :ollama_pid_done
        ...wait loop...
    )
)
```

Note `&` (single) instead of `&&` — single ampersand means "run next regardless", which is what we want for env-then-exe chaining inside `cmd /c`. `&&` requires success of the previous command, but `set` returns no useful exit code in this chain.

### C. Remove the stray empty line in `logs\pids.txt`

Replace:
```bat
> "logs\pids.txt" echo.
```
with:
```bat
:: Reset PID tracker (truncate, no blank line)
break > "logs\pids.txt"
```
`break >` truncates a file to zero bytes without writing anything.

### D. Same single-`&` fix for AGENT and WEB launches

```bat
start "AGENT" /B cmd /c "bin\node\node.exe server\index.js >> logs\agent.log 2>&1"
timeout /t 1 /nobreak >nul
for /f "tokens=2" %%P in ('tasklist /FI "IMAGENAME eq node.exe" /NH ^| sort /R') do (
    echo %%P>> "logs\pids.txt"
    goto :agent_pid_done
)
:agent_pid_done
```

Same pattern for WEB. Capturing the newest matching process by PID-descending sort is more reliable than the WMI command-line LIKE filter (which can return stale or wrong PIDs and is slow).

## 2. `stop-offline.bat` — Strict PID-only stop

**Problems in current file:**
- Falls back to killing **all** `ollama.exe` and `llama-server.exe` by image name — would kill processes the user started independently outside this launcher.
- Uses fuzzy WMI `CommandLine -like '*server\index.js*'` which is slow and can match unrelated node processes.
- Tries to `taskkill` blank lines from the empty-line bug above.

**Fixes:**

```bat
@echo off
setlocal enabledelayedexpansion
title LocalDev AI - Stop Offline Services
color 0C
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo.
echo  Stopping LocalDev AI offline services...
echo.

if not exist "logs\pids.txt" (
    echo  [INFO] No logs\pids.txt found - nothing to stop.
    echo  (start-offline.bat was not run, or already stopped)
    pause & exit /b 0
)

set "STOPPED=0"
for /f "usebackq tokens=* eol=#" %%P in ("logs\pids.txt") do (
    set "PID=%%P"
    :: Skip blank lines
    if not "!PID!"=="" (
        :: Verify PID is numeric before killing
        for /f "delims=0123456789" %%X in ("!PID!") do set "PID="
        if not "!PID!"=="" (
            taskkill /F /PID !PID! >nul 2>&1
            if not errorlevel 1 (
                echo  [OK] Killed PID !PID!
                set /a STOPPED+=1
            ) else (
                echo  [--] PID !PID! already gone
            )
        )
    )
)

del "logs\pids.txt" 2>nul
echo.
echo  Stopped !STOPPED! tracked process(es).
echo  Other ollama/node processes on this PC were left untouched.
echo.
pause
endlocal
```

Key changes:
- **No image-name fallback.** Only PIDs we tracked get killed. User's other Node/Ollama processes stay alive.
- **Numeric PID validation** prevents `taskkill` errors from stray non-numeric lines.
- **`eol=#`** lets us skip comment lines if we ever add them.
- **Counter** so user knows how many processes were actually stopped.

## 3. Result

- `start-offline.bat` fails fast and clearly when ports are taken or files missing — no more silent failures hidden in `logs\*.log`.
- PID tracking captures the actual process we spawned, not pre-existing ones.
- `stop-offline.bat` is surgical — kills only what `start-offline.bat` started, leaves user's other dev processes alone.
- Bat-file syntax uses single `&` for env+exe chains inside `cmd /c`, eliminating the parsing bugs.

## Files Changed

| File | Change |
|------|--------|
| `start-offline.bat` | Add preflight (ports + required files); fix `&&`→`&` in launch chains; `break >` for clean PID file; capture PIDs via `tasklist` instead of WMI |
| `stop-offline.bat` | Remove image-name fallback; validate numeric PIDs; counter; skip blank/comment lines |

## Out of Scope

- `prepare-usb.bat`, `server/static.cjs`, `USB-README.md` — untouched.
- macOS/Linux equivalents — separate follow-up.
- No new dependencies, no new files.

