
# Hardening Pass — One Settings Page, Reliable .bat Launchers, Working Auto-Build

A focused audit-driven cleanup. No new features, no architecture changes — just fixing the bugs and confusion the user called out.

## Problems Found

### 1. Two settings UIs (the "five different settings" complaint)
- `src/components/SettingsDialog.tsx` — 1396-line modal opened from `/` (Index page), 12 tabs.
- `src/pages/IDESettings.tsx` — separate full-page route at `/settings`, opened from IDE and IoT workspaces.
- Result: settings split across two surfaces. IDE/IoT navigate to `/settings` (page), main Index opens the modal — same options exist in both with different layouts.

### 2. `start.bat` still has the `&&`-in-`cmd /c` bug
Line 227: `start "" /B cmd /c "set OLLAMA_HOST=… && set OLLAMA_MODELS=… && "!OLLAMA_CMD!" serve"` — same fragile chaining we already fixed in `start-offline.bat`. Often fails to set env vars before launching Ollama.

### 3. `start-offline.bat` PID capture is unreliable
`tasklist /FI "IMAGENAME eq node.exe" /NH ^| sort /R` picks the **highest** PID, not the newest. PIDs wrap around 2^16 on Windows, so a long-uptime host can have lower PIDs for new processes than for old ones. We also launch **two** node.exe processes (agent + web) — both PID-capture loops can grab the same PID (web) and miss the agent.

### 4. Auto-Build doesn't actually build
`src/components/AutoBuildPanel.tsx` calls `onSendMessage` 6 times and discards every response except for a 100-char preview. No code blocks are parsed, no files are written. It's a progress-bar demo, not a builder.

### 5. Cosmetic bugs in `server/index.js`
Line 25: `crypto.randomHex ? crypto.randomBytes(16)... : crypto.randomBytes(16)...` — both branches identical, dead ternary. Looks like AI-generated noise.

### 6. `IDESettings.tsx` `useEffect` missing `devPort` in deps
Line 113: `useEffect(() => { … detectLocalIP().then(…) }, [])` references `devPort` from closure but doesn't list it. Stable today (constant), but fragile.

### 7. No `.gitignore` entries for portable bins
`bin/node/`, `bin/ollama/*.exe`, `dist/`, `logs/` could end up committed accidentally on a fresh clone.

## Changes

### A. Consolidate settings → single page (`/settings`)

- **Delete `src/components/SettingsDialog.tsx`** entirely.
- **Migrate every tab** from `SettingsDialog` (Backend, Models, Voice, Hardware, Config, API Keys, TTS, Prompt, Debug, Plugins, Updates, Account) **into `src/pages/IDESettings.tsx`** as additional `<Tabs>` sections alongside the existing Mode/LLM/Remote-Access sections.
- **`src/pages/Index.tsx`**:
  - Remove `SettingsDialog` import, `settingsOpen`, `settingsTab` state, and the `<SettingsDialog>` JSX.
  - Replace `setSettingsOpen(true)` everywhere with `navigate('/settings')`.
  - The `open-settings` window event handler routes to `/settings?tab=…` instead of opening the modal.
- **`IDESettings.tsx`**: read `?tab=` from the URL on mount and set the active `Tabs` value.
- Result: one settings surface, reachable from every workspace via the gear icon.

### B. Fix `start.bat` Ollama launch

Replace the `&&` chain on line 227 with the same pattern we use in `start-offline.bat`:

```bat
start "OLLAMA" /B cmd /c "set OLLAMA_HOST=127.0.0.1:11434& set OLLAMA_MODELS=%SCRIPT_DIR%models\ollama& "!OLLAMA_CMD!" serve"
```

(`&` not `&&` — `&&` requires success of the previous command, which `set` always returns 0 for, but the parser frequently mis-tokenizes inside `cmd /c "…"`.)

### C. Reliable PID tracking in `start-offline.bat`

Switch from "newest PID after launch" to **PID snapshot diffing**:

```bat
:: Before launching agent
for /f "tokens=2 delims=," %%P in ('tasklist /FI "IMAGENAME eq node.exe" /NH /FO CSV 2^>nul') do set "BEFORE_!{NODE_PIDS}!=%%~P"

:: Launch agent, wait, then diff
for /f "tokens=2 delims=," %%P in ('tasklist /FI "IMAGENAME eq node.exe" /NH /FO CSV') do (
  if not defined BEFORE_%%~P echo %%~P>> "logs\pids.txt" & set "BEFORE_%%~P=1"
)
```

Concretely: maintain a set of "already-seen PIDs" before each launch, sleep 800ms after launch, then any node.exe PID not in the seen-set is the new process. Add it to `pids.txt` AND to the seen-set so the next launch's diff is correct. Same pattern for `ollama.exe` and `llama-server.exe`.

This is bulletproof against PID wraparound and against pre-existing host node processes.

### D. Make Auto-Build actually write files

Edit `src/components/AutoBuildPanel.tsx`:

1. Import `parseCodeBlocks` from `@/lib/code-parser` and `writeFile` from `@/lib/file-system`.
2. After each step's response, parse code blocks and call `writeFile` for each one.
3. Track the count of files written per step and display in the step `detail` ("3 files written").
4. After the final step, show a summary: total files written, with a "Done" button.
5. If a step produces zero code blocks (e.g., "Analyze" step), that's expected — just show the response text preview.

### E. Cleanup `server/index.js` line 25

```js
const SESSION_TOKEN = crypto.randomBytes(16).toString('hex');
```

### F. Add `devPort` to the `IDESettings.tsx` effect deps array

Trivial fix: `}, [devPort]);`

### G. Update `.gitignore`

Append (idempotent — only add if missing):
```
bin/node/
bin/ollama/*.exe
bin/llama/*.exe
dist/
logs/
node_modules/
```

## Files Touched

| File | Change |
|------|--------|
| `src/pages/IDESettings.tsx` | Absorb all 12 tabs from `SettingsDialog`; read `?tab=` from URL |
| `src/components/SettingsDialog.tsx` | **Delete** |
| `src/pages/Index.tsx` | Remove modal, route to `/settings` |
| `src/components/AutoBuildPanel.tsx` | Parse responses, write files via `writeFile` |
| `start.bat` | Fix `&&` → `&` in Ollama launch |
| `start-offline.bat` | PID diff-based capture (replace `sort /R` blocks) |
| `server/index.js` | Remove dead ternary on line 25 |
| `.gitignore` | Add bin/, dist/, logs/, node_modules/ |

## Verification (post-implementation)

- Boot `start-offline.bat` on a host with a pre-existing `node.exe` running → confirm `pids.txt` contains exactly 2 (or 3 with Ollama) new PIDs.
- Run `stop-offline.bat` → confirm only those PIDs die, the pre-existing node.exe survives.
- Open `/` and click the gear icon → lands on `/settings`. Open `/ide` → gear → also `/settings`. No modal anywhere.
- Open Auto-Build → describe a small project → verify files appear in the project tree (or in the picked folder).

## Out of Scope

- macOS/Linux portable launchers
- Bundling .gguf models into `prepare-usb.bat`
- Any UI redesign beyond merging tabs
- Settings tab reorganization (keep existing groupings — just put them all on one page)
