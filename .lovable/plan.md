## Goal

Audit every setup/launcher/test script so a fresh user can clone, double-click one script, and end up with a working app — with Ollama, llama.cpp, models, agent, frontend, and acceptance tests all linked to the same paths.

## Problems found in the current scripts

1. **Path drift between scripts** — three different "Ollama models" directories are used:
   - `RUN-ALL.bat` → `.ollama` (correct, matches memory rule)
   - `scripts/setup.bat` → `models\ollama`
   - `scripts/advanced/PULL-DEFAULT-MODEL.bat` → `.ollama` (correct)
   - `start-offline.bat` → `.ollama` with fallback to `models\ollama`
   - `config/settings.json` → `./.ollama` (correct)
   Result: a model pulled by `setup.bat` is invisible to `RUN-ALL.bat`.

2. **Wrong default model** — `setup.bat` pulls `llama3.2`, but `PULL-DEFAULT-MODEL.bat` and the registry expect `qwen2.5:3b`. Two different "defaults" confuses users.

3. **`setup.bat` violates the "no auto-download in launchers" rule** — it pulls a model during setup with no opt-out. Memory rule says model pulls must be a manual step.

4. **No single entry-point test** — `scripts/acceptance.bat` exists but is never invoked by setup, and there is no script that says "run setup, then verify everything is wired".

5. **`scripts/setup.sh` / `setup.ps1`** exist but were not audited against the current `.ollama` / `qwen2.5:3b` convention — likely drifted the same way.

6. **`prepare-usb.bat`** downloads Node + Ollama into `bin\` but its model-pull step (read above) needs to match the same default and directory.

7. **No "verify links" script** — nothing checks that `config/settings.json.model_path` matches the directory `RUN-ALL.bat` actually exports as `OLLAMA_MODELS`, or that `bin/ollama/ollama.exe` is the one being launched.

8. **`README` / `USB-README` / `DEPLOYMENT.md`** don't agree on which script to run first.

## Plan

### A. Unify paths and defaults (single source of truth)

- Treat `config/settings.json` as the source of truth. Keep:
  - `model_path: "./.ollama"`
  - `default_model: "qwen2.5:3b"` (new field)
  - `ollama_port: 11434`, `llama_port: 8081`, `app_port: 8080`, `agent_port: 3847`
- Every `.bat` reads those values (via a tiny `scripts/_load-config.bat` helper that parses the JSON with `powershell -Command`) instead of hardcoding paths.

### B. Fix `scripts/setup.bat`

- Remove the automatic `ollama pull llama3.2` step.
- Replace step 5/6 with: "Ollama detected → run `scripts\advanced\PULL-DEFAULT-MODEL.bat` to fetch the default model (optional)."
- Point `OLLAMA_MODELS` at `.ollama` (not `models\ollama`) so it matches RUN-ALL.
- Mirror the same fix in `setup.ps1` and `setup.sh`.

### C. Fix `prepare-usb.bat`

- Use `.ollama` as the model dir.
- Pull `qwen2.5:3b` (the registry default), not `llama3.2`.
- Keep it as the only script that is allowed to download large assets (Node, Ollama, default model) — clearly labeled "one-time, needs internet".

### D. Add `scripts/verify-links.bat`

A new read-only diagnostic that prints PASS/FAIL for:
- `bin/node/node.exe` exists OR system `node` on PATH
- `bin/ollama/ollama.exe` exists OR system `ollama` on PATH
- `bin/llama/llama-server.exe` present (optional)
- `.ollama/` exists and is writable
- `models/gguf/` exists
- `config/settings.json` parses and matches the launcher's hardcoded ports
- `server/index.cjs`, `server/static.cjs`, `dist/` (for offline) present
- Ports 8080/3847/11434/8081 free OR already owned by our own processes

### E. Add `scripts/test-all.bat`

A single "does everything actually work" script that:
1. Calls `scripts/verify-links.bat` (static checks)
2. Starts `RUN-ALL.bat` in background if services aren't up
3. Waits for `:3847/status`, `:8080`, and `:11434/api/tags`
4. Runs `scripts/acceptance.bat --build`
5. Runs `scripts/route-smoke-test.bat`
6. Prints a single PASS/FAIL summary and exit code

### F. Documentation pass

Rewrite the top of `README.md` and `USB-README.md` to show one canonical flow:

```
First time (with internet):     scripts\prepare-usb.bat
Every time:                     RUN-ALL.bat   (or double-click START-PORTABLE-AI.bat)
Verify install:                 scripts\verify-links.bat
Full test:                      scripts\test-all.bat
Pull/upgrade default model:     scripts\advanced\PULL-DEFAULT-MODEL.bat
Stop everything:                STOP-PORTABLE-AI.bat
```

Remove any older references to `start.bat` flows that mention different model paths.

### G. Sanity-check the wrappers

- `start.bat`, `START-PORTABLE-AI.bat` already just `call RUN-ALL.bat` — keep as-is.
- `start-offline.bat` — drop the `models\ollama` fallback, use `.ollama` only, so behavior matches RUN-ALL.

## Out of scope

- No changes to app source (`src/`, `server/`). This pass is purely scripts + config + docs.
- No new model downloads in any launcher. Only `prepare-usb.bat` and the explicit `PULL-DEFAULT-MODEL.bat` may fetch models.
- No changes to acceptance/route-smoke logic — they already work; we just make sure setup leaves the environment in a state where they pass.

## Deliverables

- Edited: `scripts/setup.bat`, `scripts/setup.ps1`, `scripts/setup.sh`, `scripts/prepare-usb.bat`, `start-offline.bat`, `config/settings.json`, `README.md`, `USB-README.md`
- New: `scripts/_load-config.bat`, `scripts/verify-links.bat`, `scripts/test-all.bat`
- Final proof: output of `scripts\verify-links.bat`, `scripts\test-all.bat`, and `npm run build`.
