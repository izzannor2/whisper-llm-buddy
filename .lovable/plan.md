# Make AI Companion Hub Truly Portable & Friend-Ready

The app already has solid bones (portable Node, offline launcher, settings consolidation, bundled-update scanner). The remaining gaps are in **launcher ergonomics**, **automatic update apply on boot**, **clearer diagnostics**, and a **Vite cache repair path**. Below is the focused, surgical work — no UI redesign, no breaking changes.

## 1. New friend-ready launchers (root of project)

All four scripts use `%~dp0` to resolve their own folder so they work from any drive letter, USB stick, or copied location. No hardcoded paths.

**`START-PORTABLE-AI.bat`** — single double-click entry point
```
@echo off
setlocal enabledelayedexpansion
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"
set "OLLAMA_MODELS=%PROJECT_ROOT%\.ollama"
set "OLLAMA_HOST=127.0.0.1:11434"
:: ensure dirs, then delegate to existing start-offline.bat
for %%D in (.ollama models\gguf models\ollama public\updates logs config) do if not exist "%%D" mkdir "%%D"
call "%PROJECT_ROOT%\start-offline.bat"
```

**`START-OLLAMA-PORTABLE.bat`** — standalone Ollama with portable model dir
**`START-GGUF-SERVER.bat`** — picks first `*.gguf` in `models\gguf\`, launches `bin\llama\llama-server.exe` on `127.0.0.1:8081`
**`REPAIR-APP.bat`** — deletes `node_modules\.vite`, `dist\.vite`, `logs\pids.txt`; offers to re-run `prepare-usb.bat`

## 2. Portable path standardization

- Update `start-offline.bat` and `start.bat`: change Ollama models dir from `%ROOT%\models\ollama` to `%ROOT%\.ollama` to match the user's spec (also keeps Ollama's native folder convention; existing `models\ollama` kept as fallback for back-compat — code reads either).
- `server/index.js` already uses `path.resolve(__dirname, '..')` — no hardcoded paths there. ✓
- `server/static.cjs` already uses `path.resolve(__dirname, '..', 'dist')`. ✓
- `src/lib/update-system.ts` `scanBundledUpdates()` uses relative `/updates/manifest.json`. ✓

## 3. Auto-apply bundled updates on startup (no manual import)

In `src/App.tsx` (or `src/main.tsx`), add a one-shot bootstrap effect:

```ts
// runs once on load
import { scanBundledUpdates, applyLocalUpdate, getCurrentVersion, compareVersions } from '@/lib/update-system';

const APPLIED_KEY = 'localdev-bundled-applied';
const applied: string[] = JSON.parse(localStorage.getItem(APPLIED_KEY) || '[]');
const updates = await scanBundledUpdates();
for (const u of updates) {
  if (applied.includes(u.version)) continue;
  if (compareVersions(u.version, getCurrentVersion()) > 0) {
    const r = applyLocalUpdate(u);
    if (r.success) { applied.push(u.version); }
  } else {
    applied.push(u.version); // mark as seen even if older
  }
}
localStorage.setItem(APPLIED_KEY, JSON.stringify(applied));
```

This satisfies "permanent updates" — bundled packs apply automatically, never re-apply. Manual import via `UpdatePanel` continues to work.

## 4. Diagnostics cleanup (`SettingsDialog` Diagnostics tab + new `/selftest` endpoint)

The `/selftest` endpoint already exists (`server/index.js`). Extend the **Diagnostics** tab in `SettingsDialog.tsx` to show one consolidated card with the exact statuses requested:

- Ollama running ✓/✗ (`/api/tags`)
- Ollama model count + first 3 names
- Portable model path (read from `/selftest` response — add `ollamaModelsDir` to it)
- GGUF model count (already in `/selftest`)
- llama.cpp server status — when offline show neutral **"Not running — start GGUF server"** badge with a "Copy start command" button (NOT a red error)
- TTS available (`isTTSSupported()`)
- Whisper loaded (`localStorage 'whisper-model-loaded'`)
- WebGPU status (`'gpu' in navigator`)

Remove the duplicate health-scan effect in `SettingsDialog.tsx` (lines 83–132) — it duplicates what `/selftest` and `LauncherToolsDialog` already do. Single source of truth: one "Refresh diagnostics" button that calls `/selftest`.

Console encoding garbage (`ΓòÉ`): replace remaining box-drawing Unicode in `start.bat` headers with plain ASCII (`==========`). `start-offline.bat` is already clean.

## 5. GGUF picker UX

In `LocalModelPicker` and the llama.cpp section of `IDESettings.tsx`:
- When `isLlamaCppRunning() === false`, render an info (not error) state: "llama.cpp server not running" + button **"Start GGUF Server"** that calls `/exec` on the agent (port 3847) with `bin\\llama\\llama-server.exe -m models/gguf/<first.gguf> --port 8081`.
- If agent server is unreachable, fall back to "Copy start command" + show the path to `START-GGUF-SERVER.bat`.

## 6. Vite cache repair (in-app)

Add a "Repair Vite Cache" button in the **Diagnostics** tab. It calls the agent `/exec` to:
```
node -e "require('fs').rmSync('node_modules/.vite',{recursive:true,force:true})"
```
then shows a toast: "Cache cleared — restart dev server with `npm run dev -- --force`". If agent is offline, show the manual command + a link to `REPAIR-APP.bat`.

## 7. First-run setup checklist

Extend `FirstRunSetup.tsx` with one new step `'mode'` before `'backend'`:
- Two cards: **Portable Mode** (sets `localStorage.localdev-portable-mode=true`, recommends Ollama backend) vs **Installed Mode** (default).
- Auto-create folders is already handled by the `.bat` launchers; in-browser we can't create disk folders, so the checklist just **shows** which folders exist via `/selftest` and which are missing, with copy-paste `mkdir` commands.

## 8. Settings consolidation cleanup

Already done in prior work — `SettingsDialog` mounts inline at `/settings`. Confirm there's no remaining `<SettingsDialog open={...}>` mounted as a modal anywhere. (`Index.tsx` already removed it; verify `IDE.tsx`, `IoTWorkspace.tsx`, `ImproveWorkspace.tsx` — change any leftover modal usages to `navigate('/settings?tab=…')`.)

## 9. Files changed

| File | Change |
|------|--------|
| `START-PORTABLE-AI.bat` | **new** — friend-ready entry point |
| `START-OLLAMA-PORTABLE.bat` | **new** |
| `START-GGUF-SERVER.bat` | **new** |
| `REPAIR-APP.bat` | **new** — clears Vite cache & PID file |
| `start-offline.bat` | use `.ollama` dir; keep `models\ollama` fallback |
| `start.bat` | replace remaining box-drawing chars with ASCII; same `.ollama` change |
| `server/index.js` | `/selftest` returns `ollamaModelsDir`, TTS/Whisper/WebGPU placeholders for client to fill |
| `src/App.tsx` | add bundled-update auto-apply bootstrap |
| `src/components/SettingsDialog.tsx` | remove duplicate health-scan effect; new consolidated Diagnostics card driven by `/selftest`; "Repair Vite Cache" button |
| `src/components/LocalModelPicker.tsx` | non-scary "Not running — Start GGUF Server" state |
| `src/components/FirstRunSetup.tsx` | add Portable/Installed mode step + folder checklist |
| `src/pages/IDE.tsx`, `IoTWorkspace.tsx`, `ImproveWorkspace.tsx` | audit for any leftover SettingsDialog modal usage; route to `/settings?tab=…` |

## Out of scope

- macOS/Linux launchers (separate follow-up; `start.sh` already exists for Linux/macOS dev mode).
- Rewriting the QR code generator (placeholder is acceptable for LAN access).
- Touching `src/integrations/supabase/*` (auto-generated).
- Changing the actual app builder, AI improvement, IDE, or voice subsystems.

## Result

A friend can copy the whole folder to a USB stick, plug it into any Windows PC, double-click `START-PORTABLE-AI.bat`, and the app finds its Ollama models, GGUF models, bundled updates, logs, and config without a single manual path fix.
