

# Fully Portable USB Runtime — Offline .bat Suite

Make the project run end-to-end from a USB stick on any Windows PC with **zero installs on the host**. Everything (Node, Ollama, models, app) lives inside the project folder.

## Current State

You already have:
- `start.bat`, `start.sh`, `scripts/setup.bat`, `scripts/setup.ps1`, `scripts/setup.sh`
- `bin/node/`, `bin/ollama/`, `bin/llama/`, `models/gguf/`, `models/ollama/` directory scaffolding
- `config/settings.json` with relative paths
- `server/index.js` local agent on port 3847

**Gaps:**
1. No script that **downloads** portable Node + Ollama into `bin/` (current scripts assume binaries are already there or fall back to system installs).
2. No script that **bundles a built dist + offline server** so the app runs without `npm run dev` (Vite needs network for the first install).
3. `OLLAMA_MODELS` env var not set when launching Ollama → it writes models to `%USERPROFILE%\.ollama` on the host instead of `models/ollama/` on the USB.
4. No "fully offline" launcher that skips all network checks.
5. No single `INSTALL-TO-USB.bat` that prepares a fresh USB from a connected PC.

## What I'll Add

### 1. `scripts/prepare-usb.bat` (run ONCE on a connected PC)
One-time prep script — downloads everything portable into the project folder so it can be copied to USB:
- Downloads **portable Node.js 20 LTS** zip → extracts to `bin/node/`
- Downloads **Ollama Windows zip** → extracts to `bin/ollama/`
- Runs `npm ci` using portable Node to populate `node_modules/`
- Runs `npm run build` to produce `dist/` (so app runs without dev server)
- Pulls default model `llama3.2` into `models/ollama/` via `OLLAMA_MODELS` env redirect
- Verifies all binaries with version checks
- Prints "USB ready — copy entire folder to USB drive"

### 2. `start-offline.bat` (the daily-driver launcher)
Pure-offline launcher — no network calls, no install attempts:
- Sets `OLLAMA_MODELS=%CD%\models\ollama` so Ollama uses USB storage
- Sets `PATH=%CD%\bin\node;%CD%\bin\ollama;%PATH%`
- Starts portable Ollama serve in background (if `bin/ollama/ollama.exe` exists)
- Starts portable llama-server in background (if `bin/llama/llama-server.exe` + a `.gguf` exists)
- Starts the local agent server (`server/index.js`) on port 3847
- Serves the prebuilt `dist/` via a tiny static server on port 8080 (using portable Node + a vendored `serve` package, or a 30-line static server we ship in `server/static.cjs`)
- Opens browser to `http://localhost:8080`
- Single console window with tagged output (`[OLLAMA]`, `[AGENT]`, `[WEB]`)

### 3. `stop-offline.bat`
Cleanly kills Ollama, llama-server, agent, and static server processes started by `start-offline.bat` (tracks PIDs in `logs/pids.txt`).

### 4. `server/static.cjs` (~40 lines)
Tiny zero-dependency Node static file server that serves `dist/` with SPA fallback to `index.html`. Avoids needing the `serve` npm package over network.

### 5. Update `start.bat` (existing)
Keep as-is for "online dev mode" but add a top banner: `"For pure offline USB usage, run start-offline.bat instead"`.

### 6. `USB-README.md` (root)
Plain-English instructions:
- "First time on a connected PC: double-click `scripts\prepare-usb.bat`"
- "Then copy the whole folder to your USB drive"
- "On any Windows PC: double-click `start-offline.bat`"
- Troubleshooting: port conflicts, Windows SmartScreen warning, antivirus quarantine of `ollama.exe`

## Technical Details

**Portable Node download URL** (no installer):  
`https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip`

**Ollama Windows portable**:  
`https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip`

**OLLAMA_MODELS env**: Setting this before `ollama serve` redirects all model storage to a custom path — confirmed Ollama-supported env var.

**Static server**: `http.createServer` + `fs.readFileSync` + simple MIME map + SPA fallback. ~40 lines, zero deps, ships in `server/static.cjs`.

**PID tracking**: Each background `start "" /B` writes its PID to `logs/pids.txt` via PowerShell one-liner; `stop-offline.bat` reads and `taskkill /F /PID` each.

**Drive-letter independence**: All scripts use `%~dp0` (script's own directory) and `cd /d "%~dp0\.."` so they work from any drive letter — already the existing convention.

## Validation

- On a fresh Windows VM with no Node/Ollama: copy USB folder → double-click `start-offline.bat` → app loads at `localhost:8080`, Ollama serves models from `models/ollama/`, agent responds on 3847. **No host installs.**
- Pull USB → plug into different PC → same flow works without re-prep.
- `stop-offline.bat` cleanly kills all processes; no orphans.
- Existing `start.bat` / `start.sh` / dev workflow unchanged.

## Files Changed/Added

| File | Change |
|------|--------|
| `scripts/prepare-usb.bat` | **NEW** — one-time USB prep (downloads Node + Ollama + builds dist + pulls model) |
| `start-offline.bat` | **NEW** — pure-offline launcher with portable everything |
| `stop-offline.bat` | **NEW** — clean shutdown of all background processes |
| `server/static.cjs` | **NEW** — zero-dep static file server for `dist/` |
| `start.bat` | Add banner pointing to `start-offline.bat` for USB use |
| `USB-README.md` | **NEW** — root-level USB usage guide |
| `.gitignore` | Add `bin/node/`, `bin/ollama/*.exe`, `dist/`, `logs/pids.txt` if missing |

## Out of Scope

- macOS/Linux portable equivalents (existing `start.sh` covers dev; portable Linux Node/Ollama bundling would be a follow-up).
- Auto-updating portable binaries — manual re-run of `prepare-usb.bat` refreshes them.
- Bundling .gguf models into the prep script (too large; user drops their own into `models/gguf/`).

