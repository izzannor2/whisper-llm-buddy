# Production Cleanup Plan — AI Companion Hub

Goal: convert the project to a truly portable, production-grade app — no simulations, no hardcoded paths, real model discovery, single Settings UI, and reliable launchers.

## 1. Backend module crash (ESM ↔ CommonJS)

`package.json` declares `"type": "module"`, but `server/index.js` uses `require()`. Node treats `.js` as ESM and crashes with `require is not defined`.

Fix: **rename `server/index.js` → `server/index.cjs`** (no source changes needed; matches existing `server/static.cjs`). Update launchers to spawn `server\index.cjs`.

Files: `server/index.js` (rename), `start-offline.bat`, `start.bat`, `START-PORTABLE-AI.bat`, `package.json` scripts if any.

## 2. Vite scanning bin/llama and llama.cpp tools

Vite's dep-scanner walks anything imported transitively and (in some setups) follows public/ siblings. Lock it down:

- Add `server.fs.deny` for `bin/**`, `models/**`, `.ollama/**`, `logs/**`.
- Add `server.watch.ignored` for the same.
- Add `optimizeDeps.exclude` for `node-fetch` and explicitly exclude bin paths.
- Add an `.viteignore`-equivalent via `build.rollupOptions.external` for any accidental `bin/llama/tools/**` import.
- Add `bin/`, `models/`, `.ollama/`, `logs/` to `.gitignore` and ensure no `index.html` exists under them.

File: `vite.config.ts`.

## 3. Remove all simulations & fake data

Audit and replace with real-only behavior in:

- `src/components/ide/Terminal.tsx` — remove any local "simulated" execution branch; require live agent. If agent offline, show a disabled state with a "Start agent" hint (no fake output).
- `src/lib/chat-api.ts` — remove `llama3.2` from any hardcoded "available local models" arrays. Local models must come exclusively from the discovery service.
- `src/pages/Models.tsx` — drop seeded sample lists; render only discovered Ollama + GGUF results, with empty state "No models detected".
- `src/lib/ide-types.ts` / `DEFAULT_SETTINGS` — change `selectedModel` default from `llama3.2` to empty string; UI gates send button until a real model is chosen.
- `src/lib/project-export.ts` — strip any sample-model defaults baked into exports.
- AutoBuildPanel / preset prompts — keep prompt templates but label them "Templates"; never assert a model is installed.

Acceptance: with zero models present, every surface shows "No models detected" and chat send is disabled.

## 4. Central real model-discovery service

New file: `src/lib/model-registry.ts`.

```text
listLocalModels() ->
  1. fetch http://127.0.0.1:11434/api/tags  (browser, 1.5s timeout)
  2. on failure -> fetch http://127.0.0.1:3847/ollama/tags (agent proxy)
  3. on failure -> fetch http://127.0.0.1:3847/scan/ollama (read-only manifest scan of .ollama/manifests)
  4. + fetch http://127.0.0.1:3847/scan/gguf  (recursive models/gguf/**/*.gguf)
  Returns: { ollama: Model[], gguf: Model[], source: 'live'|'agent'|'scan', errors: [] }
```

- Cache 10s, broadcast via custom event `models-changed` so all surfaces refresh.
- Add agent endpoints in `server/index.cjs`:
  - `GET /ollama/tags` → proxies `http://127.0.0.1:11434/api/tags`.
  - `GET /scan/ollama` → reads `.ollama/manifests/**` filenames only.
  - `GET /scan/gguf` → recursive walk of `models/gguf/**/*.gguf`.
  - `GET /scan/llama-server` → recursive find of `bin/llama/**/llama-server(.exe)`.

Refactor consumers to use the registry: `Models.tsx`, `SettingsDialog.tsx`, `ChatInput.tsx`, `LocalModelPicker.tsx`, `IDESettings.tsx`, `AutoBuildPanel.tsx`, `ImproveWorkspace.tsx`.

## 5. Portable Ollama path

- Launchers always set `OLLAMA_MODELS=%PROJECT_ROOT%\.ollama` and `OLLAMA_HOST=127.0.0.1:11434` (already partly done; verify in all four launchers).
- Add a runtime check in the registry: if Ollama is reachable but its `models[*].name` count is 0 while `.ollama/manifests` has entries on disk (via agent scan), surface a toast: "Ollama is running with a different models folder. [Restart Ollama Portable]" — button calls `POST /agent/restart-ollama` which re-spawns with the portable env.

## 6. Real GGUF discovery

- Recursive scan via the agent (above).
- `scan/llama-server` is recursive under `bin/llama/**`.
- Treat GGUF as **optional**: launcher never aborts if `bin/llama/llama-server.exe` is missing — it logs `[INFO] GGUF disabled (no llama-server)` and proceeds.
- `LocalModelPicker.tsx` lists every discovered .gguf with relative path; empty state "Drop a .gguf into models/gguf/".

## 7. Model Routing tab

New module `src/lib/model-routing.ts` with persisted map (`localStorage` key `model-routing-v1`):

```text
roles = ['assistant','voice','ide','app-builder','improvement','vision','embeddings']
routing[role] = { provider:'ollama'|'gguf'|'cloud', model: string }
resolveModel(role) -> resolved or fallback chain (role default -> assistant default -> first detected -> null)
```

New tab in Settings: **Model Routing**. Each role row shows a `<Select>` populated from the registry (only detected models + cloud models if cloud enabled). "Use default" link. Missing-model badge if the saved choice is no longer detected.

Refactor each surface to call `resolveModel(role)` instead of reading `selectedModel` directly.

## 8. Single, clean Settings UI

There are currently two Settings entry points (`SettingsDialog` used inline in `IDESettings.tsx`, plus extra panels). Consolidate:

- Keep `/settings` route (`IDESettings.tsx`) as the **only** settings page; remove all standalone settings dialogs from other pages (replace with a "Open Settings" link to `/settings#tab`).
- Restructure tabs to exactly: **General | Models | Model Routing | Voice | Updates | Diagnostics | Advanced**.
- Move existing content under those tabs; delete duplicated sections (current dialog has overlapping Cloud/Local/API-key panels — merge into General + Models).
- Sidebar/header gets a single ⚙ link to `/settings`.

## 9. Repair script — clean output

Rewrite `REPAIR-APP.bat` to do guarded deletes only (no recursive enumerations that print "file not found" lines):

```text
if exist node_modules\.vite       rmdir /s /q node_modules\.vite
if exist node_modules\.cache      rmdir /s /q node_modules\.cache
if exist dist\.vite               rmdir /s /q dist\.vite
if exist logs\pids.txt            del /f /q logs\pids.txt
echo [DONE] Repair complete.
```

Optional `npm install` prompt at the end. No `2>nul` swallowing real errors; redirect only the targeted commands.

## 10. Launcher files

Verify/fix all five:

- `START-PORTABLE-AI.bat` — `cd /d %~dp0`, set `PROJECT_ROOT`, set `OLLAMA_MODELS=%PROJECT_ROOT%\.ollama`, mkdir missing folders, call `start-offline.bat`. Never fail on missing GGUF.
- `START-OLLAMA-PORTABLE.bat` — already good, keep.
- `START-GGUF-SERVER.bat` — already good; make llama-server discovery recursive (`for /r bin\llama %%f in (llama-server.exe)`).
- `REPAIR-APP.bat` — see #9.
- `STOP-PORTABLE-AI.bat` — **new**, wraps `stop-offline.bat` with `cd /d %~dp0` so it works from any drive.

All launchers must spawn the agent as `bin\node\node.exe server\index.cjs`.

## 11. Persistent updates system

`src/App.tsx` already auto-applies bundled updates and stores applied IDs in `localStorage`. Make this also persist to disk:

- Add agent endpoints `GET /updates/applied` and `POST /updates/applied` reading/writing `config/applied-updates.json`.
- On startup, merge localStorage + disk record. After applying a new bundled update, POST to agent so the record survives a browser-storage wipe.
- Keep manual import path as-is.

## 12. Acceptance test (added to repo)

Add `scripts/acceptance.md` describing the manual checks from the request, plus a small `scripts/acceptance.bat` that:

1. Pings `http://127.0.0.1:3847/status` and reports OK/FAIL.
2. Pings `http://127.0.0.1:11434/api/tags` and prints model count.
3. Lists `.gguf` count under `models/gguf`.
4. Confirms `package.json` has `"type":"module"` and `server/index.cjs` exists.

---

## Files touched (summary)

**Renamed:** `server/index.js` → `server/index.cjs`

**New:**
- `src/lib/model-registry.ts`
- `src/lib/model-routing.ts`
- `STOP-PORTABLE-AI.bat`
- `scripts/acceptance.bat`, `scripts/acceptance.md`

**Edited:**
- `vite.config.ts` (deny/ignore/exclude)
- `server/index.cjs` (new endpoints: ollama proxy, scan/ollama, scan/gguf, scan/llama-server, updates/applied)
- `start-offline.bat`, `start.bat`, `START-PORTABLE-AI.bat`, `START-GGUF-SERVER.bat`, `REPAIR-APP.bat`
- `src/App.tsx` (disk-backed applied updates)
- `src/pages/IDESettings.tsx` (tab restructure + Model Routing tab)
- `src/components/SettingsDialog.tsx` (collapse duplicates, render via registry)
- `src/components/ChatInput.tsx`, `src/components/LocalModelPicker.tsx`, `src/components/AutoBuildPanel.tsx`, `src/components/ide/Terminal.tsx`
- `src/pages/Models.tsx`, `src/pages/ImproveWorkspace.tsx`
- `src/lib/chat-api.ts`, `src/lib/ide-types.ts`, `src/lib/project-export.ts` (strip hardcoded model lists/defaults)

## Out of scope (kept as-is)

App Builder, Assistant Mode, AI Improvement, IDE, Voice/Whisper/TTS, Diagnostics card, First-Run Setup, Voice Calibration Wizard. Only the wiring (which model they use, how they discover it) changes.
