# Whole-app QA & Consistency Pass

## 1. Rename "Jailbreak / Uncensored" → "Advanced Prompt Override"
Drop "jailbreak"/"uncensored" branding. Keep functionality as advanced custom system prompt mode.

Files to update:
- `src/components/ChatSidebar.tsx` — mode entry `key:'jailbreak'` → label "Advanced Prompt Override", description "Custom system prompt (advanced)".
- `src/components/ModesSidebar.tsx` — same rename.
- `src/components/EmptyState.tsx` — banner: "Custom prompt active. Does not bypass model/provider safety rules."
- `src/lib/ide-types.ts` — description: "Custom system prompt — does not bypass safety rules".
- `src/pages/IDESettings.tsx` (Advanced tab) — relabel toggle to "Advanced Prompt Override". Add explicit warning Alert: *"Custom prompts can make the assistant less reliable. They do not bypass model/provider safety rules."*
- Keep storage keys (`jailbreakEnabled`, `jailbreakPrompt`) untouched for backward compat — only UI labels change. Add internal getter `getOverridePrompt(settings)` in `src/lib/chat-api.ts` for use across modes.

## 2. Consistent Override Application
Add a single helper `applyPromptOverride(systemPrompt, settings)` that appends override prompt (when enabled) to the end of the base system prompt. Wire into:

- Assistant chat — `src/pages/Index.tsx` (already concatenates `settings.systemPrompt` — confirm path).
- App Builder — `src/pages/IDE.tsx` (currently overwrites `effectiveSettings.systemPrompt`; switch to append).
- IDE chat — `src/components/ide/IDEChat.tsx`.
- AI Improvement — `src/pages/ImproveWorkspace.tsx` (currently passes `systemPrompt: ''` — must include override).
- Voice mode — `src/components/VoiceCallMode.tsx`.
- IoT, Sandbox, Planning, Autonomous, OpenClaw — same helper.

For modes that intentionally don't apply it (e.g. embeddings, tool sub-calls), surface a small footer note in the chat header: **"Prompt override not applied in this mode."** when `jailbreakEnabled` is true but unused.

## 3. Prompt Override Presets
Add preset dropdown above the textarea in IDESettings Advanced tab:

- Strict Coder — terse code-only answers, no prose.
- App Builder — multi-file scaffolding focus.
- Debugging Assistant — root-cause oriented, asks for logs.
- Offline Local Assistant — assumes no internet, prefers local tools.
- Creative Brainstormer — ideation, divergent options.

Stored in new `src/lib/prompt-presets.ts`. Selecting a preset fills the textarea (still user-editable). No unsafe/illegal templates.

## 4. Whole-app Route Smoke Test
- Add `scripts/route-smoke-test.bat` (and `.sh`) that runs `npx vite build` then a quick puppeteer-free check by curling the dev server for `/`, `/models`, `/ide`, `/settings`, `/improve`, `/iot`, `/sandbox` (HTTP 200 + non-empty body).
- Add npm script `"smoke": "node scripts/route-smoke-test.mjs"` and a Node version that spawns `vite preview` then probes routes. Logs pass/fail per route.

## 5. App Builder Preview Health Card
New `src/components/ide/PreviewHealthCard.tsx` rendered in IDE above/inside PreviewPane:
- Mode: live | iframe fallback | offline (from existing preview state)
- Preview URL (copyable)
- Session folder (from `/dev-server/status`)
- Last build error (from error-bus filtered `source:'preview'|'build'`)
- Buttons: Restart Preview, Copy Preview Debug (reuse PreviewPane handlers)

## 6. Model Usage Audit (debug metadata)
Update `src/lib/chat-api.ts` `sendChatMessage` to accept optional `meta: { role: ModelRole }` and emit a debug event after each call:
```
{ role, provider, model, fallbackReason, responseMs }
```
Push to `error-bus` as `source:'model'` info-level event and to a new ring buffer in `src/lib/diagnostics.ts` (`getModelCallLog()`). Render last 20 calls in DiagnosticsPanel under a new "Recent Model Calls" section. All caller sites pass their role.

## 7. Update System — Test Package Generator
In `UpdatesPanel.tsx` add button **"Create test update package"** → generates a harmless JSON:
```json
{ "version": "test-<timestamp>", "name": "Test Update", "description": "Harmless QA package", "changes": [] }
```
Downloads via Blob. User can then re-import via existing "Import update package JSON" to test full import → apply → rollback flow.

## 8. Final No-Fake-Data Scan
Confirmed clean from search; remaining cosmetic:
- `model-routing.ts` line 32 comment uses `llama3.2:3b` as example — change to generic `<provider:model>` placeholder.
- `model-registry.ts` line 15 comment — same.
- Verify ModelManager presets (if any) labeled as **"Templates — not installed"** when shown.

## Acceptance
- `scripts/acceptance.bat` extended to also call `route-smoke-test`.
- Build passes `npx vite build`.
- No occurrences of "jailbreak"/"uncensored" in user-facing strings.
- Override toggle shows safety-rules warning.
- Override actually included in all 5 listed surfaces (verified by debug log showing system prompt length increase).
- Diagnostics tab shows last model calls with role/provider/model/fallback/ms.

## Files
**New**: `src/lib/prompt-presets.ts`, `src/components/ide/PreviewHealthCard.tsx`, `scripts/route-smoke-test.bat`, `scripts/route-smoke-test.mjs`
**Edited**: `src/components/ChatSidebar.tsx`, `src/components/ModesSidebar.tsx`, `src/components/EmptyState.tsx`, `src/lib/ide-types.ts`, `src/pages/IDESettings.tsx`, `src/lib/chat-api.ts`, `src/pages/Index.tsx`, `src/pages/IDE.tsx`, `src/components/ide/IDEChat.tsx`, `src/pages/ImproveWorkspace.tsx`, `src/components/VoiceCallMode.tsx`, `src/pages/IoTWorkspace.tsx`, `src/pages/SandboxWorkspace.tsx`, `src/components/PlanningView.tsx`, `src/lib/autonomous-mode.ts`, `src/lib/openclaw-agent.ts`, `src/components/ide/PreviewPane.tsx`, `src/components/settings/DiagnosticsPanel.tsx`, `src/lib/diagnostics.ts`, `src/components/settings/UpdatesPanel.tsx`, `src/lib/model-routing.ts`, `src/lib/model-registry.ts`, `scripts/acceptance.bat`, `package.json`
