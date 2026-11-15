# AI Companion Hub — Local workstation

## Windows setup and daily use

| Task | Entry point |
| --- | --- |
| Prepare portable Node 20 + Ollama and build the app (internet required) | `scripts\prepare-usb.bat` |
| Install app dependencies with existing Node 20 | `scripts\setup.bat` |
| Start/reuse Ollama, optional llama.cpp, agent, and frontend | `RUN-ALL.bat` |
| Start without dependency installs using prebuilt app | `start-offline.bat` |
| Download a model manually, after startup | `scripts\advanced\PULL-DEFAULT-MODEL.bat` |
| Inspect setup and service health | `scripts\verify-links.bat` |
| Run Windows acceptance checks | `scripts\test-all.bat` |
| Stop this project's listeners only | `STOP-PORTABLE-AI.bat` |
| Stop owned services, clear safe caches, repair dependencies | `REPAIR-APP.bat` |
| Explicit clean dependency reinstall | `REPAIR-APP.bat -Reinstall` |

**No setup or launcher automatically downloads models.** Portable preparation downloads Node and Ollama binaries and builds the app; downloading a model is a separate manual step. Missing Ollama/llama.cpp is reported, not replaced by cloud AI.

All Windows entry points delegate to **`scripts/runtime.ps1`** through `scripts/dispatch.bat`. Older names (`start.bat`, `START-PORTABLE-AI.bat`, `stop-offline.bat`) are compatibility shortcuts, not additional implementations. Individual Ollama/GGUF launch shortcuts use that same implementation. PowerShell setup delegates to the same setup action.

Startup validates Node 20 and npm, repairs incomplete or changed dependencies using the lockfile, reuses healthy services, reports port owners when blocked, and opens the browser only after required checks pass. A missing binary/model is reported as unconfigured; an installed service failing startup stops the launch with an error.

## Ports and files

- App: `http://localhost:8080`
- Agent: `http://127.0.0.1:3847/status`
- App Builder status: `http://127.0.0.1:3847/dev-server/status`
- Ollama: `11434`; llama.cpp: `8081`
- Ollama storage: `.ollama/`; GGUF files: `models/gguf/`
- Portable binaries: `bin/node/`, `bin/ollama/`, `bin/llama/`
- CAD projects: `projects/3d/`
- Logs: `logs/start.log`, `logs/startup-errors.log`, `logs/agent.log`, `logs/web.log`, `logs/ollama.log`, `logs/ollama-error.log`, `logs/llama.log`

The launcher ports and paths above are the supported defaults. `config/settings.json` is retained for legacy tooling; editing it does **not** reconfigure all app connections. An external Ollama instance may use its own model folder; the manual pull script explicitly warns about this.

## Linux/macOS

```bash
bash scripts/setup.sh  # Node 20 and npm must already be installed
bash start.sh          # all configured services, no model downloads
# Manual model download after Ollama is running:
ollama pull qwen2.5:3b
# Prebuilt offline app, without dependency installation:
HUB_OFFLINE=1 bash start.sh
```

## Troubleshooting

Windows errors stay visible and are logged. Use `scripts\verify-links.bat` for service health and port/PID information. Stop only the listed project services; no script kills all Node processes. Repair never deletes models, projects, settings or logs. Services started elsewhere are left untouched.

Tests: `node --test scripts/reliability.test.mjs scripts/setup.test.mjs`. Windows end-to-end checks require a Windows PC with the actual local services; passing static checks is not proof that inference works.
