# LocalDev AI — Portable USB Runtime

Run the entire app **offline from a USB stick** on any Windows PC. Zero installs on the host.

## One-time prep (on a PC with internet)

1. Double-click `scripts\prepare-usb.bat`
2. Wait while it downloads:
   - Portable **Node.js 20 LTS** → `bin\node\`
   - Portable **Ollama** → `bin\ollama\`
   - Installs `node_modules\`
   - Builds `dist\`
   - Pulls default model `llama3.2` → `models\ollama\`
3. Copy this **entire folder** to your USB drive.

## Daily use (on any Windows PC)

1. Plug in the USB.
2. Double-click `start-offline.bat`.
3. Browser opens to http://localhost:8080.

Services started:
- **Web app** on `:8080` (serves prebuilt `dist\`)
- **Local agent** on `:3847` (shell, file ops)
- **Ollama** on `:11434` (if `bin\ollama\ollama.exe` present)
- **llama-server** on `:8081` (if a `.gguf` is in `models\gguf\` and `bin\llama\llama-server.exe` exists)

To stop everything cleanly: double-click `stop-offline.bat`.

## What's where

| Path | Purpose |
|------|---------|
| `bin\node\` | Portable Node.js runtime |
| `bin\ollama\` | Portable Ollama binary |
| `bin\llama\` | (optional) llama.cpp `llama-server.exe` |
| `models\ollama\` | Ollama model storage (USB-local) |
| `models\gguf\` | Drop your own `.gguf` models here |
| `dist\` | Prebuilt web app |
| `logs\` | Runtime logs + PID tracker |
| `config\settings.json` | App settings (relative paths) |

## Troubleshooting

**SmartScreen warning** — Click "More info" → "Run anyway". The binaries are unsigned portable releases.

**Antivirus quarantines `ollama.exe`** — Add `bin\ollama\` to your AV exclusions, or skip Ollama and use Cloud mode.

**Port already in use (8080 / 11434 / 3847 / 8081)** — Run `stop-offline.bat`, then retry. Or change ports in `config\settings.json` and `server\static.cjs` (`PORT` env).

**"dist\ not built"** — You skipped `prepare-usb.bat`. Run it on a connected PC first.

**Model not loading** — Confirm `models\ollama\` contains a `manifests\` and `blobs\` subfolder. If empty, run `bin\ollama\ollama.exe pull llama3.2` (with `OLLAMA_MODELS=%CD%\models\ollama` set).

**Different drive letter** — All scripts are drive-letter independent (`%~dp0`). Just plug in and run.

## Online dev mode (not USB)

If you're developing locally with internet, use `start.bat` instead — it runs `npm run dev` with hot reload.
