## Production stability + master launcher fixes

Most of the requested infrastructure is already in place (portable batch suite, `server/index.cjs` with `/ollama/tags`, `/scan/ollama`, `/scan/gguf`, `/updates/applied`; `model-registry.ts` with the exact resolution order; vite config blocking portable dirs; model routing). This pass closes the remaining gaps.

### 1. New master launcher: `RUN-ALL.bat`
Single double-click entry. Uses `%~dp0` only, never hardcoded paths. Flow:
1. `cd /d "%~dp0"` and set `PROJECT_ROOT`, `OLLAMA_MODELS=%PROJECT_ROOT%\.ollama`, `OLLAMA_HOST=127.0.0.1:11434`, `GGUF_MODELS=%PROJECT_ROOT%\models\gguf`.
2. Ensure `.ollama`, `models\gguf`, `models\ollama`, `logs`, `config`, `bin\llama`, `bin\ollama`, `bin\node`, `public\updates` exist.
3. Detect Node: prefer `bin\node\node.exe`, fall back to system `node`. If neither, print error and exit.
4. Start Ollama:
   - Probe `:11434/api/tags`. If up, query `/api/show`-style envs is not possible, so just warn that an existing Ollama may use a different model dir, with hint to run `STOP-PORTABLE-AI.bat` then re-run.
   - If down: prefer `bin\ollama\ollama.exe`, else system `ollama`. Start with portable env, log to `logs\ollama.log`. Skip silently if neither exists.
5. Start llama.cpp (optional): recursive search for `bin\llama\**\llama-server.exe` and `models\gguf\**\*.gguf`. If both found, launch on `:8081` logged to `logs\llama.log`. Otherwise print `[INFO] GGUF disabled — continuing with Ollama`.
6. Start backend agent: `node server\index.cjs` logged to `logs\agent.log`.
7. Start frontend dev server: `npm run dev -- --host 0.0.0.0 --port 8080` logged to `logs\web.log` (only if `node_modules` exists; otherwise run `npm install` first).
8. Open `http://localhost:8080` in default browser after a short readiness poll.
9. Never `exit /b 1` for missing optional components. Only fail on missing Node + missing `node_modules` + no internet for `npm install`.

Window stays open with a status summary and `pause` at the end.

### 2. Backend: portable Ollama restart endpoint
Add to `server/index.cjs`:
- `POST /agent/restart-ollama` — kills existing `ollama` processes (Windows: `taskkill /IM ollama.exe /F`, *nix: `pkill ollama`), then spawns `bin/ollama/ollama` (fallback system `ollama`) with `OLLAMA_MODELS=<PROJECT_ROOT>/.ollama` and `OLLAMA_HOST=127.0.0.1:11434`, detached, logging to `logs/ollama.log`. Returns `{ok, pid, modelsDir}`.
- `GET /agent/ollama-info` — returns `{running, manifestCount, expectedDir}` by reading `:11434/api/tags` count and counting files under `.ollama/models/manifests`. Used for the mismatch check.

### 3. Frontend: Ollama mismatch warning
In the Models page (and Settings → Models tab):
- On mount, fetch `getModelRegistry()` plus `/agent/ollama-info`.
- If `ollama.length === 0` AND `manifestCount > 0`, render an alert:
  > Ollama is running from a different model folder. Click below to restart it against the portable `.ollama/` directory.
  
  with a `[Restart Ollama Portable]` button that POSTs to `/agent/restart-ollama`, then refreshes the registry. Toast on success/failure.

### 4. Zero-model state — disable actions
Create `src/hooks/use-models-available.ts` returning `{loading, hasAny, snapshot}` from `getModelRegistry`. Then:
- `ChatInput.tsx`: when `!hasAny && backend === 'local'`, disable Send button and show inline "No models detected — open Settings → Models".
- `ide/IDEChat.tsx`: same gate for the Run/Send button.
- `AutoBuildPanel.tsx`: gate the "Build" action.
- Models page already shows empty state; ensure copy reads exactly **"No models detected"** with no demo entries.

### 5. Strip remaining `llama3.2` placeholders
- `src/components/SettingsDialog.tsx` line 370: replace toast text with `"Ollama is running but no models installed. Pull one from the Models page."`.
- Lines 764 + 774: replace placeholder/help text with neutral copy ("model name, e.g. your-installed-model").
- `src/pages/Models.tsx` line 256: change input placeholder to `"model:tag"`.
- `src/lib/project-export.ts` lines 46, 264, 277, 297: replace `|| 'llama3.2'` with `|| '<your-model>'` in exported docs (no runtime fallback).

### 6. Verify backend uses CommonJS everywhere
Already done (`server/index.cjs`, `server/static.cjs`, all batch files reference `.cjs`). No change needed; spot-check after edits.

### 7. Acceptance smoke
After edits, run a quick build to catch TS/JSX errors (the harness handles this automatically — no manual `tsc`).

### Files to add / edit

**New**
- `RUN-ALL.bat`
- `src/hooks/use-models-available.ts`

**Edited**
- `server/index.cjs` — add `/agent/restart-ollama`, `/agent/ollama-info`
- `src/pages/Models.tsx` — mismatch alert, restart button, placeholder copy
- `src/components/SettingsDialog.tsx` — strip `llama3.2` strings, mismatch alert in Models tab
- `src/components/ChatInput.tsx` — disable send when no local models
- `src/components/ide/IDEChat.tsx` — same gate
- `src/components/AutoBuildPanel.tsx` — same gate
- `src/lib/project-export.ts` — neutralize placeholder model name

### Out of scope (already correct)
- `vite.config.ts` portable ignores
- `model-registry.ts` resolution order
- `model-routing.ts` per-role routing with fallback
- `server/index.cjs` ESM rename and existing scan endpoints
- Existing `START-PORTABLE-AI.bat` / `start-offline.bat` flow (kept as-is; `RUN-ALL.bat` is an additional friend-friendly entry)
