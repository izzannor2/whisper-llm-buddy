
## Goal

Make `RUN-ALL.bat` the single entry point that boots **every** local service in one click:

1. Local agent (`server/index.cjs` on `:3847`)
2. Ollama (`:11434`) with portable models dir `.ollama`
3. llama.cpp `llama-server` (`:8081`) when a GGUF is present
4. Vite dev server (`:8080`)
5. Browser opens to `http://localhost:8080`

## Current state

`RUN-ALL.bat` already attempts all five steps. The script structure is sound, but a few gaps can cause one of the services to silently not start:

- **Ollama launcher uses `&&` inside `cmd /c`**: the `set OLLAMA_MODELS=... && set OLLAMA_HOST=... && ollama.exe serve` chain breaks when delayed-expansion vars contain spaces. Switch to `&` separators and quote properly so env vars actually reach the child process.
- **llama-server is started without log redirection** (line 161). Failures vanish. Redirect to `logs\llama.log` like Ollama.
- **Agent launched with `cmd /k`** keeps a window open but the script never tails `logs\server.log` if it dies *after* the 15s wait. Add a final post-wait health re-check before claiming READY.
- **Frontend launched with `cmd /k`** but `npm run dev` errors (port conflict, missing dep) only surface in that window. Add a health re-poll after the 30s wait and dump `logs\web.log` if it never came up.
- **No log file for the frontend / agent windows** when launched with `cmd /k` — output only lives in the spawned console. Tee to `logs\agent.log` and `logs\web.log` in addition to the visible window so RUN-ALL transcript captures failures.
- **Port-busy detection** exists for 8080 but not for 11434 / 8081 / 3847 before launch. Add symmetric pre-checks so we report PID/process instead of double-launching.
- **Ollama auto-pull**: if `OLLAMA_UP=1` but `/api/tags` returns empty, optionally pull a default small model so the user has something to chat with on first run (gated behind `AUTO_PULL=1` env to avoid surprise downloads).

## Plan

### 1. Fix Ollama startup env propagation
Replace line 134 with a form that survives delayed expansion and quoted paths:
```text
start "OLLAMA" /B cmd /c "set ""OLLAMA_MODELS=!OLLAMA_MODELS!"" & set ""OLLAMA_HOST=!OLLAMA_HOST!"" & ""!OLLAMA_BIN!"" serve >> logs\ollama.log 2>&1"
```

### 2. Add log redirection + readiness re-check for llama-server
- Change line 161 to `start "LLAMA" /B cmd /c "...llama-server.exe... >> logs\llama.log 2>&1"`.
- Add a 5-iteration `curl /health` poll after launch, set `LLAMA_UP=1`, print OK/WARN.

### 3. Tee agent + web windows to log files
- Agent: `start "AI Agent" cmd /k "call ""!NODE_BIN!"" server\index.cjs 2>&1 | powershell -NoProfile -Command \"$input | Tee-Object logs\agent.log -Append\""`
- Web: same pattern with `logs\web.log`.
- Fall back to plain `>> logs\agent.log 2>&1` (no visible window) if PowerShell is missing.

### 4. Symmetric port pre-checks
Before each service launch, run a small `:check_port <port> <name>` subroutine that:
- Skips launch if our own service already answers (current behavior).
- Reports PID + image name if a foreign process owns the port and aborts that step (not the whole script).

### 5. Final health summary + non-zero exit on critical failures
After step 10, build a status table:
```text
Agent  : OK/FAIL
Web    : OK/FAIL
Ollama : OK/SKIPPED/FAIL
Llama  : OK/SKIPPED/FAIL
```
Exit `1` only if Agent or Web failed (Ollama/llama remain optional).

### 6. Optional first-run model pull
Gate behind `AUTO_PULL=1`:
```text
if "!OLLAMA_UP!"=="1" if /I "%AUTO_PULL%"=="1" (
    curl -s http://127.0.0.1:11434/api/tags | findstr /C:"\"name\"" >nul || start "PULL" /B cmd /c ""!OLLAMA_BIN!" pull qwen2.5:3b >> logs\ollama-pull.log 2>&1"
)
```

### 7. Documentation
Update the closing banner to list every started service with its log path so the user immediately knows where to look if something is missing.

## Files touched

- `RUN-ALL.bat` (only file edited)

## Out of scope

- Changes to `server/index.cjs`, `server/static.cjs`, or any frontend code.
- Changing the offline / dist-based launcher (`start-offline.bat`) — separate flow.
- Bundling new binaries; we only fix orchestration of what's already in `bin/`.
