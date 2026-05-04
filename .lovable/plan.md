## Polish & Stability Pass

Scope: consolidate Settings, make Updates real, add diagnostics bundle, improve preview reliability, polish model registry/routing, expand status indicators, central error bus, acceptance tests. No fake data, no alternate launchers.

### 1. Settings consolidation (`src/pages/IDESettings.tsx`)
Replace current mixed layout with a single `Tabs` component:
`General | Models | Model Routing | Voice | Updates | Diagnostics | Advanced`
- Move all backend/API/key fields out of the embedded `SettingsDialog` and into the right tab; remove the duplicated dialog mount.
- General: theme, telemetry off, language, agent URL, project root.
- Models: `ModelManager` only (rescan, dedupe, source badges).
- Model Routing: `ModelRoutingPanel` with new controls (section 6).
- Voice: existing Voice settings (TTS/STT/Whisper).
- Updates: new `UpdatesPanel` (section 2).
- Diagnostics: new `DiagnosticsPanel` (section 3).
- Advanced: power-user flags, export/import, danger zone.

### 2. Updates tab — real & testable
New `src/components/settings/UpdatesPanel.tsx`. Reads from existing update system; no new behavior beyond surfacing.
Shows: current app version (from `package.json` via Vite define), bundled updates from `/updates/manifest.json`, applied history from `http://127.0.0.1:3847/updates/applied` (agent), disk-applied status, manual JSON paste/import, per-update Rollback, "Run update self-test".
Agent-offline banner when 3847 down: "Disk persistence unavailable — updates will apply in-memory only."

### 3. Diagnostics tab — one-click bundle
New `src/components/settings/DiagnosticsPanel.tsx` + `src/lib/diagnostics.ts`.
Buttons: Copy Bundle, Save Bundle (download .json), Run Self-Test, Test Preview Server, Test Ollama, Test GGUF.
Bundle shape (each entry tagged `ok | missing | error`):
```text
{ status, selftest, debugSnapshot, devServerStatus, ollamaInfo,
  modelRegistry, recentLogs:{server,web,llama,ollama}, routing, updates }
```
Endpoints hit: `/status`, `/selftest`, `/debug/snapshot`, `/dev-server/status`, `/agent/ollama-info`, `/updates/applied`, `/logs/tail?name=…`. Before adding any UI button, verify each endpoint exists in `server/index.cjs`; if missing, add it (read-only log tail with line cap, ollama-info proxy). No 404s — missing ones rendered as "endpoint missing" rows.

### 4. Preview reliability (`src/components/ide/PreviewPane.tsx`)
Add status header row: Session ID, Port, URL, Last error, Retry, Stop.
Distinguish three states: live-server-ready / iframe-fallback-active / agent-down. Fallback message: "Instant preview active. Live server not ready." Only say "agent unavailable" when `useAgentStatus().connected === false`.

### 5. Model registry polish (`src/lib/model-registry.ts` + `ModelManager.tsx`)
- Dedupe by `${provider}:${name||relPath}` after merge.
- Source badge already in data; render in `ModelManager` and `LocalModelPicker`.
- Mismatch warning: if `ollamaSource === 'live'` returns 0 models but `manifest-scan` finds >0, show amber banner "Ollama running but registered 0 models — manifest shows N. Restart Ollama with portable models dir."
- Auto-refresh every 10s while Models tab visible (visibility-gated interval).
- Rescan button in `ModelManager`, `LocalModelPicker`, `ModelRoutingPanel`.

### 6. Model routing polish (`src/components/ModelRoutingPanel.tsx` + `model-routing.ts`)
- "Recommended" button per role (heuristic: voice→smallest chat-capable, vision→multimodal, embeddings→embed-tagged, others→largest installed).
- "Auto-assign all" applies recommendations to unset roles only.
- Missing model red badge when `resolveModelSync` returns `fallbackReason==='missing'`.
- Persisted toggles (localStorage): `useFirstAvailableFallback`, `autoSwitchByTask`. Wire `autoSwitchByTask` into `chat-api` task→role mapping.

### 7. Hardware/status indicators (`src/components/SystemStatusBar.tsx`, `IDEStatusFooter.tsx`)
Add: agent heartbeat age (seconds since last `/status` 200), preview process status, last model call status + duration, high-load warning when CPU≥90 for 10s or RAM≥90.

### 8. Central error bus (`src/lib/error-bus.ts`)
Tiny pub/sub. `emitError({source, message, detail})` → fans out to sonner toast, in-memory ring buffer (last 200), and `window.__errorBus`. `errors.ts` `handleError` and preview/agent/update/launch flows publish here. Diagnostics tab shows the buffer; bundle includes it.

### 9. Acceptance tests (`scripts/acceptance.bat`)
File-existence checks + `findstr` to confirm `start.bat` and `START-PORTABLE-AI.bat` contain `call RUN-ALL.bat`. `curl` checks for `/status`, `/selftest`, `/debug/snapshot`, `/dev-server/status`, `/updates/applied`. Ollama/GGUF checks accept "0 models" as PASS (clean empty state). Prints PASS/FAIL summary, exits non-zero on any FAIL.

### 10. No fake data
Audit and remove any placeholder rows in models, updates, terminal, preview status. Empty states instead.

### Files
**New**: `src/components/settings/UpdatesPanel.tsx`, `src/components/settings/DiagnosticsPanel.tsx`, `src/components/settings/GeneralPanel.tsx`, `src/components/settings/AdvancedPanel.tsx`, `src/lib/diagnostics.ts`, `src/lib/error-bus.ts`, `scripts/acceptance.bat`.
**Edited**: `src/pages/IDESettings.tsx` (full rewrite to tabs), `src/components/ModelRoutingPanel.tsx`, `src/components/ModelManager.tsx`, `src/components/LocalModelPicker.tsx`, `src/lib/model-registry.ts` (dedupe), `src/lib/model-routing.ts` (toggles, recommend), `src/components/ide/PreviewPane.tsx`, `src/components/SystemStatusBar.tsx`, `src/components/ide/IDEStatusFooter.tsx`, `src/lib/errors.ts` (route through bus), `server/index.cjs` (add `/agent/ollama-info`, `/logs/tail` if missing; verify existing endpoints).
**Untouched**: `RUN-ALL.bat`, `start.bat`, `START-PORTABLE-AI.bat`, `src/integrations/supabase/*`, `.env`.

### Verification after build
Run `npm run build` and report output; if dev server is needed, run `npm run dev` and capture startup lines until Vite prints the local URL.
