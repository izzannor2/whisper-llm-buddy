

# Production-Ready Portable AI Companion Hub — Full Audit & Upgrade

## Context
This is a **browser-based React app** (Vite + React 18) with startup scripts for local execution. Many requests (bundled Node.js in `/bin`, disk-based logs, `config/settings.json`) apply to the **local execution environment** (start scripts), while the app itself runs in a browser with localStorage-based config. The plan addresses both layers.

## What's Already Working
- Start scripts (`start.bat`, `start.sh`, `setup.ps1`) already handle portable Ollama/llama.cpp detection in `bin/`
- Chat API supports 7 backends (cloud, local, ollama, openai, anthropic, google, huggingface)
- Model dropdown in chat input with dynamic Ollama/Llama.cpp scanning
- Debug panel with service health checks
- Settings dialog with backend switching

## What Needs Fixing

### Phase 1: Startup Scripts — Config File + Logging + Self-Healing

**New file: `config/settings.json`** (default config, created by scripts if missing)
```json
{
  "ollama_path": "./bin/ollama",
  "llama_path": "./bin/llama",
  "model_path": "./models",
  "log_path": "./logs",
  "auto_start_ollama": true,
  "default_model": "llama3.2",
  "ollama_port": 11434,
  "llama_port": 8081,
  "app_port": 8080
}
```

**Update `start.bat`**:
- Read config from `config/settings.json` using PowerShell one-liner for JSON parsing
- Create `logs/` directory, redirect all output to `logs/app.log` (tee to console)
- Add self-healing: if `node_modules` exists but key packages missing, auto-delete and reinstall
- Add `OLLAMA_MODELS` env var pointing to `%~dp0models\ollama` so Ollama stores models locally
- Use `%~dp0` everywhere (script directory) instead of assuming CWD — this is the USB portability fix
- Add duplicate process detection (check if ports already in use before starting servers)
- Add clear step numbering and timing for each phase

**Update `start.sh`**:
- Same config reading, logging, self-healing, relative paths using `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"`
- Set `OLLAMA_MODELS=$SCRIPT_DIR/models/ollama` for portable model storage

**New file: `setup.bat`** (one-click first-time setup)
- Check and install portable Node.js into `bin/node/` if not present
- Download Ollama portable if not in `bin/ollama/`
- Pull default model
- Run `npm install`
- Create default config

### Phase 2: App — Ollama Model Directory + Health Auto-Recovery

**File: `src/lib/chat-api.ts`**
- In `sendOllamaMessage`: if Ollama returns connection error, show toast with "Restart AI Engine" action button
- Add offline mode support for Ollama backend (currently blocked — only `local` works offline)

**File: `src/pages/Index.tsx`**
- Add periodic health check (every 30s) for active backend — if server goes down, show warning banner
- Add "Restart AI Engine" button in the status area that triggers Ollama restart via the local backend agent
- Improve init scan: retry Ollama/Llama.cpp detection 3 times with 2s delay instead of single attempt

### Phase 3: Settings — System Status Panel + Restart Button

**File: `src/components/SettingsDialog.tsx`**
- Add a "System Status" section at the top of the settings dialog showing:
  - Ollama: Running/Stopped (with auto-scan on open)
  - Llama.cpp: Running/Stopped
  - Current model loaded
  - Estimated memory usage (from Ollama API `/api/show`)
- Add "Restart AI Engine" button that POSTs to Ollama's `/api/generate` with empty prompt to warm up, or shows instructions
- Add "Re-scan Models" button that triggers both Ollama and Llama.cpp model discovery

**File: `src/components/DebugPanel.tsx`**
- Add a "Logs" tab that shows the last 100 console log entries captured in-memory
- Add "Export Diagnostics" button that downloads a JSON file with all service statuses, settings (sanitized), and recent logs

### Phase 4: README + Documentation

**File: `README.md`** — Complete rewrite:
- USB portability instructions (just copy folder, run `start.bat`)
- How to add GGUF models (drop in `models/gguf/`)
- How to add Ollama models (they auto-store in `models/ollama/` when `OLLAMA_MODELS` is set)
- Troubleshooting: common errors and fixes
- Folder structure diagram
- Supported backends table

### Phase 5: Folder Structure Cleanup

Create missing directories and move files:
- `config/` — for `settings.json` default config
- `logs/` — with `.gitkeep`
- `scripts/` — move `setup.ps1` here, add `setup.bat`
- Keep `start.bat` and `start.sh` in root (entry points)
- Keep existing `bin/`, `models/`, `src/`, `supabase/` structure

```text
/AI-Companion-Hub/
├── start.bat              # Windows launcher (double-click)
├── start.sh               # Linux/Mac launcher
├── README.md              # Full documentation
├── config/
│   └── settings.json      # Default config (created on first run)
├── logs/                   # Runtime logs
├── scripts/
│   ├── setup.bat           # One-click first-time setup
│   └── setup.ps1           # PowerShell setup
├── bin/
│   ├── ollama/             # Portable Ollama binary
│   └── llama/              # Portable llama-server binary
├── models/
│   ├── gguf/               # Drop GGUF files here
│   └── ollama/             # Ollama model storage
├── src/                    # React app source
├── supabase/               # Edge functions
└── public/                 # Static assets
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `config/settings.json` | Create — default portable config |
| `logs/.gitkeep` | Create — ensure logs dir exists |
| `scripts/setup.bat` | Create — one-click Windows setup |
| `start.bat` | Rewrite — config reading, logging, relative paths, self-healing |
| `start.sh` | Rewrite — same improvements for Unix |
| `scripts/setup.ps1` | Move from root `setup.ps1` |
| `src/pages/Index.tsx` | Add periodic health check, retry init scan, restart button |
| `src/components/SettingsDialog.tsx` | Add system status panel, restart button |
| `src/components/DebugPanel.tsx` | Add logs tab, export diagnostics |
| `src/lib/chat-api.ts` | Allow offline mode for Ollama, better error recovery |
| `README.md` | Complete rewrite with USB/portable docs |

## What Won't Change
- No folder reorganization of `src/` (the React app structure is fine)
- No backend/database changes needed
- No new npm dependencies
- Edge functions stay as-is

