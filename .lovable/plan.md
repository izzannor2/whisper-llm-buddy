## Fix RUN-ALL.bat for reliability and debuggability

Rewrite `RUN-ALL.bat` so failures are visible, the agent is verified before the frontend launches, and Node detection is explicit. No other files change.

### Changes to `RUN-ALL.bat`

1. **Force working directory** (already present, keep at top):
   ```
   cd /d "%~dp0"
   set "PROJECT_ROOT=%CD%"
   ```

2. **Add a visible PATH CHECK block** right after the banner:
   ```
   echo === PATH CHECK ===
   echo PROJECT_ROOT=%PROJECT_ROOT%
   echo Node candidates:
   where node 2>nul
   if exist "bin\node\node.exe" echo Portable: %PROJECT_ROOT%\bin\node\node.exe
   echo ==================
   ```

3. **Explicit Node detection** with clear failure message:
   - Prefer `bin\node\node.exe` if present.
   - Else fall back to system `node` via `where node`.
   - Else print `Node.js not found. Install Node 20 LTS or run scripts\prepare-usb.bat` and `pause & exit /b 1`.

4. **Optional port-collision cleanup** (gated, off by default to avoid killing unrelated Node processes). Add a commented `:: taskkill /f /im node.exe >nul 2>&1` line plus a `KILL_NODE` env opt-in:
   ```
   if /I "%KILL_NODE%"=="1" taskkill /f /im node.exe >nul 2>&1
   ```

5. **Start the agent with a visible window and log file**, then verify before continuing:
   ```
   echo Starting agent...
   start "AI Agent" cmd /k ""!NODE_BIN!" server\index.cjs"
   echo Waiting for agent on :3847 ...
   set "AGENT_OK=0"
   for /l %%i in (1,1,15) do (
       timeout /t 1 /nobreak >nul
       curl -s --max-time 1 http://127.0.0.1:3847/status >nul 2>&1
       if not errorlevel 1 ( set "AGENT_OK=1" & goto :agent_ready )
   )
   :agent_ready
   if not "!AGENT_OK!"=="1" (
       echo ERROR: Agent failed to start. See the "AI Agent" window and logs\agent.log
       pause
       exit /b 1
   )
   echo [OK] Agent responding on :3847
   ```
   The `cmd /k` window stays open so the user can read any crash output (was previously hidden via `/B` + log redirect).

6. **Only start frontend after agent is confirmed**:
   ```
   echo Starting frontend...
   start "WEB" cmd /k "call !NPM_CMD! run dev -- --host 0.0.0.0 --port 8080"
   ```
   Then poll `http://127.0.0.1:8080` as today.

7. **Keep existing health-check block** (`/status`, `/debug/snapshot`, `/dev-server/status`, `/3d/status`) and final READY summary. Make the final lines explicit:
   ```
   echo Open:
   echo   http://localhost:8080
   echo   http://127.0.0.1:3847/status
   ```

8. **Preserve** existing optional Ollama and llama.cpp startup (they already degrade gracefully) and the self-heal `mkdir` loop.

### Behavior after fix
- User sees a PATH CHECK block immediately, so missing Node is obvious.
- Agent runs in a visible `cmd /k` window; crashes are no longer hidden.
- Frontend only launches if `/status` responds within ~15s; otherwise script halts with a clear error and `pause`.
- All other launchers (`start.bat`, `START-PORTABLE-AI.bat`) continue to wrap `RUN-ALL.bat` unchanged.

### Out of scope
- No changes to `server/index.cjs`, acceptance tests, or 3D code — those were validated in prior passes and the current symptom is the launcher hiding agent failures.
