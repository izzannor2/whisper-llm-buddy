# AI Companion Hub — Portable

Fully portable, production-ready AI assistant. Runs entirely from a folder (or USB drive) with **zero external dependencies**.

## ⚡ Canonical workflow (Windows)

| When | Run |
|------|-----|
| First time (needs internet) | `scripts\prepare-usb.bat`  — downloads Node + Ollama + builds dist + pulls `qwen2.5:3b` |
| First time (have Node already) | `scripts\setup.bat`  — installs deps only, no model download |
| Every time | `RUN-ALL.bat` (or double-click `START-PORTABLE-AI.bat`) |
| Verify install is wired | `scripts\verify-links.bat` |
| Full end-to-end test | `scripts\test-all.bat` |
| Pull / upgrade default model | `scripts\advanced\PULL-DEFAULT-MODEL.bat` |
| Stop everything | `STOP-PORTABLE-AI.bat` |

### macOS / Linux
```bash
bash scripts/setup.sh
npm run dev:all
# optional:
ollama serve & ollama pull qwen2.5:3b
```

`RUN-ALL.bat` will use portable Node from `bin\node\` (or system Node), `npm install` if needed, start Ollama with models stored in `.ollama\`, start llama-server if a `.gguf` exists in `models\gguf\`, start the local agent on `:3847`, then start Vite on `:8080`. It never downloads models.

## 📁 Folder Structure

```
/AI-Companion-Hub/
├── start.bat              # Windows launcher (double-click to run)
├── start.sh               # Linux/Mac launcher
├── config/
│   └── settings.json      # Portable config (auto-created on first run)
├── logs/
│   └── app.log            # Runtime logs
├── scripts/
│   ├── setup.bat           # One-click first-time setup (Windows)
│   └── setup.ps1           # PowerShell setup
├── bin/
│   ├── ollama/             # Place portable Ollama binary here
│   ├── llama/              # Place portable llama-server binary here
│   └── node/               # Optional: portable Node.js
├── models/
│   ├── gguf/               # Drop .gguf model files here
│   └── ollama/             # Ollama models stored here automatically
├── src/                    # React app source code
├── supabase/               # Backend edge functions
└── public/                 # Static assets
```

## 🤖 Adding AI Models

### Ollama Models
1. Place `ollama.exe` (or `ollama` binary) in `bin/ollama/`
2. Run the app — it auto-starts Ollama and stores models in `models/ollama/`
3. Models are pulled automatically, or use: `ollama pull llama3.2`

### GGUF Models (Llama.cpp)
1. Place `llama-server.exe` (or `llama-server`) in `bin/llama/`
2. Drop any `.gguf` model file into `models/gguf/`
3. The start script auto-launches with the first model found

### Cloud Models
Cloud mode (Gemini 2.5 Flash/Pro) works out of the box with no setup needed.

### API Key Models
For OpenAI, Anthropic, or Google AI, add your API keys in **Settings → API Keys**.

## 🔧 Configuration

The file `config/settings.json` controls startup behavior:

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

## 💾 USB Portability

This project is designed to run from **any drive letter** (USB, external drive, etc.):

- All paths are relative — no hardcoded `C:\` or `/home/` paths
- Models are stored inside the project folder
- Node modules are local to the project
- No system-wide installations required (if you use portable binaries)

**To use on a USB drive:**
1. Copy the entire folder to your USB drive
2. On any Windows PC, double-click `start.bat`
3. Everything runs from the USB — nothing installed on the host machine

## 🔍 Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Node.js not found"** | Place portable `node.exe` in `bin/node/` or install from [nodejs.org](https://nodejs.org) |
| **Ollama won't start** | Check `bin/ollama/` has the binary, or install from [ollama.com](https://ollama.com) |
| **No models showing** | Click the refresh icon in Settings → Backend, or run `ollama pull llama3.2` |
| **Port already in use** | Check if another instance is running; the app detects this automatically |
| **npm install fails** | Delete `node_modules/` and restart — the app auto-retries 3 times |
| **Slow first start** | First run downloads npm packages; subsequent starts are instant |

### Checking Logs
- Runtime logs: `logs/app.log`
- In-app diagnostics: **Settings → Debug** tab
- Export full report: **Settings → Debug → Export**

## 🏗 Supported Backends

| Backend | Type | Requirements |
|---------|------|-------------|
| **Cloud (Gemini)** | Online | Internet connection |
| **Ollama** | Local | Ollama binary + model |
| **Llama.cpp** | Local | llama-server + .gguf model |
| **OpenAI** | API | API key |
| **Anthropic** | API | API key |
| **Google AI** | API | API key |
| **Hugging Face** | API | API key |

## 🛠 Development

```bash
npm install
npm run dev
```

The app runs on Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui.
