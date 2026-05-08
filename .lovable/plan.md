
# AI Companion Hub — Release Stabilization Plan

This is a single, focused stabilization pass. No new features. Goal: make Chat, App Builder, and 3D Printing feel like real products, remove cloud/Gemini leakage, route all AI through one system, and ship clean diagnostics.

---

## A. Remove cloud/Gemini & fake defaults (highest priority)

Files to change:

- `src/lib/chat-api.ts`
  - `DEFAULT_SETTINGS.backend`: `'cloud'` → `'auto'` (resolved via routing).
  - `DEFAULT_SETTINGS.model`: `'gemini-flash'` → `''`.
  - Remove the auto-fallback-to-cloud branch (lines ~286-296). Replace with a typed error: `NoModelAvailableError` so UI can show a setup card.
  - Keep cloud entries in `AVAILABLE_MODELS` but only used when user explicitly selects cloud.
- `src/components/ChatInput.tsx`
  - Remove `selectedModel = 'llama-3.2-1b'` default. Resolve from `resolveModelSync('assistant', cachedRegistry)` on render; if none, disable Send and show inline setup hint.
- `src/components/VoiceCallMode.tsx`
  - Remove `useState('gemini-flash')`. Initialize from `resolveModel('voice')`. If none → "No voice model selected" state with link to Model Routing.
- `src/components/SettingsDialog.tsx`
  - Remove the "Use Cloud / Gemini Flash" preset block (lines ~585-600). Cloud only appears under Settings → Advanced → Cloud Providers.

Search-and-label sweep (no behavior change, just labels): grep for `mock|fake|simulate|sample model|demo model|hardcoded model|llama3\.2|llama-3\.2-1b|gemini-flash` and either remove, or rename with `// TEMPLATE:` comment if the string is genuinely a template.

Acceptance: `rg "gemini-flash|llama-3\.2-1b" src/` returns only model-registry definitions, never default state.

---

## B. One model system everywhere

Centralize through `src/lib/model-routing.ts` (already exists). Add a thin helper `src/lib/ai-call.ts` that:

1. Takes `{ role, messages, signal }`.
2. Calls `resolveModel(role)`, returns typed errors when unavailable.
3. Dispatches to the right backend (Ollama / llama.cpp / cloud) based on `detected.provider`.
4. Logs every call to a ring buffer (`src/lib/ai-call-log.ts`, last 50) with: role, provider, model, fallbackReason, endpoint, durationMs, error.

Wire callsites:
- Normal chat (Index/ChatInput) → role `assistant`
- VoiceCallMode → `voice`
- AutoBuildPanel + App Builder send path → `app-builder`
- IDEChat → `ide`
- ImproveWorkspace → `improvement`
- 3D AIAssistantPanel/AIModifyPanel → `3d-printing`
- Vision-bearing requests (image/sketch attached) → `vision` (fallback to assistant if no vision model exists, with explicit toast).

Diagnostics panel reads the ring buffer and includes it in Copy Support Report.

---

## C. Normal chat polish

- `src/pages/Index.tsx`: hide debug/agent panels by default; collapse advanced into a drawer toggle.
- New `src/components/ChatHealthCard.tsx`: shows assistant model, provider, agent/Ollama/GGUF/voice statuses, last error. Used as empty-state inside Index when no model resolves.
- ChatInput Send button: disabled only on (empty) OR (no resolved model) OR (provider unreachable). Tooltip explains why.
- Replace generic `Failed to fetch` toasts with the typed-error mapping from B.

---

## D. App Builder Lovable-style

Backend (`server/index.cjs`):
- `POST /dev-server/start { sessionId? }` → creates `.preview-workspace/session-<id>/`, runs `npm i` + `vite` on a free port, returns `{ url, port, sessionFolder }`.
- `POST /dev-server/stop { sessionId }` → SIGTERM, do NOT rmSync while running.
- `GET /dev-server/status` → list of active sessions, last build error, last good preview URL.
- `GET /debug/snapshot`, `GET /debug/bundle` already exist — extend to include preview state.
- Session retention: keep last 5, prune older async (never delete the active one).

Frontend:
- `src/lib/preview-builder.ts`: orchestrates write-files → start → poll status → swap iframe. On failure, keep the previous-good iframe mounted, show inline error banner.
- Auto-fix loop (max 3): catches build/runtime error → re-prompts `app-builder` model with error+files → applies patches → restarts preview.
- Stage labels: Planning → Generating → Writing files → Starting preview → Fixing error → Ready.
- Preview UI controls: Restart, Stop, Copy URL, Copy Logs, Copy Debug.

---

## E. 3D Printing CAD layout

`src/pages/ThreeDWorkspace.tsx` reorganized:
- **Left rail**: ShapeToolbox extended with Select/Move/Rotate/Scale tool toggles + primitive buttons (cube/cylinder/sphere/cone/text/bracket/screw-hole/RC-wheel/servo-mount/hole-subtract).
- **Center**: SceneViewer (already has TransformControls + snap guides from earlier passes).
- **Right**: ShapeProperties → AIAssistantPanel → ReferenceImagePanel → SketchPad → PrinterConstraintsPanel (tabbed/accordion).
- **Bottom**: collapsible SCAD editor (hidden by default behind "Code View" toggle).

Live Preview toggle in header debounces SCAD generation and re-renders STL via `/openscad/render`. On render failure, keep last good STL in viewer + show stderr/line in inline error chip. Never write fake STL.

Viewer controls: Reset Camera, Fit, Auto-rotate, Wireframe/Shaded, Grid, Axes, Screenshot. Inspector shows bbox, tri/vertex count, STL size, approx volume (labelled "approx").

---

## F. AI 3D assistant + voice + image + sketch

- `AIAssistantPanel`: include scene JSON, current SCAD, selected object id, dimensions, printer constraints, and any reference image/sketch base64 in the request payload.
- Voice mic in 3D header → reuses shared voice system (role `voice`), command parser unchanged.
- Reference image: when no `vision` role resolves, show the literal copy: "Reference image will guide editable CAD/OpenSCAD generation."
- SketchPad: pen/eraser/undo/clear → flatten to PNG → attach as reference.

---

## G. Navigation simplification

`src/components/ModesSidebar.tsx`:
- Primary: Chat, App Builder, IDE, 3D Printing, IoT, Models, Settings.
- "Advanced Tools" collapsible drawer: OpenClaw, Autonomous, Task Graph, Memory, Plugins, Sandbox, System Helper, Learning Mode.
- No deletions — just re-grouping.

---

## H. Settings cleanup

`src/pages/IDESettings.tsx` tabs: General, Models, Model Routing, Voice, Updates, Diagnostics, Advanced.
- Remove the legacy "backend preset" block in `SettingsDialog.tsx` (or remove the dialog entirely if unused after Index cleanup — verify references first).
- Move cloud-provider fields, OpenClaw, plugins, sandbox, system helper into Advanced tab.

---

## I. Voice everywhere

Single `useVoice()` hook (already exists as scattered logic) — consolidate into `src/hooks/use-voice.ts` exposing `{state, start, stop, lastError}`. Mount the same mic button component in Chat, App Builder, IDE, Improve, 3D headers. Voice model resolved through routing role `voice`.

---

## J. Diagnostics + Updates

- `src/components/settings/DiagnosticsPanel.tsx`: add prominent "Copy Support Report" button. Collects: app version, URL, UA, model registry snapshot, routing, chat health, agent/Ollama/GGUF/preview/3D/OpenSCAD statuses, updates state, last 20 errors, AI call log ring buffer.
- `UpdatesPanel.tsx`: relabel rollback as "Restores settings/version only — does not restore source files." Separate Import Update Package vs Import History clearly.

---

## K. Launcher cleanup

- Move `START-GGUF-SERVER.bat`, `START-OLLAMA-PORTABLE.bat`, `start-offline.bat`, `stop-offline.bat` into `scripts/advanced/` (or symlinks/wrappers if path-sensitive).
- Top-level user scripts: `RUN-ALL.bat`, `STOP-PORTABLE-AI.bat`, `REPAIR-APP.bat`.
- `RUN-ALL.bat` already hardened in prior pass — verify drive-agnostic `%~dp0`, log redirection, and port-owner reporting still in place.

---

## L. Package polish

- `package.json`: `name` → `ai-companion-hub`, `version` → `1.0.0`.
- Sweep buttons/icons/labels for consistency in Index, App Builder, IDE, 3D headers.

---

## M. Acceptance test updates

`scripts/acceptance.bat` additions:
- Grep guard: fail if `src/lib/chat-api.ts` or `ChatInput.tsx` contains literal default `'gemini-flash'` / `'llama-3.2-1b'`.
- Verify `src/lib/ai-call.ts` exists.
- Verify `/dev-server/start` and `/dev-server/stop` endpoints respond.
- Existing 3D + preview checks remain.

---

## Out of scope (intentionally left approximate)

- True image-to-3D mesh generation (kept as labelled approximate).
- Volume / overhang / manifold analysis (labelled approximate in inspector).
- Shipping a full project zip — repo state is the deliverable; user can zip from working tree.

---

## Technical notes

- No DB schema changes.
- No new edge functions (reuse `chat`, `models`).
- No new dependencies expected; three.js / TransformControls already installed from prior pass.
- All changes are frontend + `server/index.cjs` (preview endpoints) + batch scripts.
- `src/integrations/supabase/*` untouched.

---

## Execution order (single build pass)

1. Defaults purge (A) — smallest blast radius first.
2. `ai-call.ts` + ring buffer (B).
3. Rewire chat/voice/builder/IDE/improve/3D callsites (B cont.).
4. ChatHealthCard + Index simplification (C, G).
5. Server preview endpoints + preview-builder (D).
6. 3D layout reorg (E, F).
7. Settings tab consolidation (H).
8. Voice hook unification (I).
9. Diagnostics support report + Updates relabel (J).
10. Launcher reshuffle + package.json (K, L).
11. Acceptance test updates + run `npm run build` + `scripts/acceptance.bat --build` (M).

Proof returned: changed files list, build log tail, acceptance log tail.
