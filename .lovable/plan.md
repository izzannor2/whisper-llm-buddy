# Release Candidate — Verification & Polish Pass

This is a large multi-area pass. To stay safe and shippable, I'll do it in tightly scoped, verifiable slices. Each slice has a clear acceptance signal so we can stop and adjust between sections instead of producing a 30-file mega-diff that breaks the build.

## Scope (9 sections)

1. **Chat diagnostics + Chat Health card** (home screen)
2. **App Builder Lovable-style repair loop** (generate → preview → auto-fix up to 3x)
3. **App Builder preview controls** (Restart/Stop/Copy URL/Logs/Debug)
4. **3D direct manipulation** (already partially done — verify + fill gaps: duplicate/delete/align)
5. **3D reference image attachment** in AI requests + vision-model warning
6. **Navigation simplification** — 7 top-level routes, rest under Advanced Tools
7. **Release Check screen** in Diagnostics
8. **Error quality mapping** — friendly remediation for known failure modes
9. **Final proof** — `npm run build`, `acceptance.bat`, `acceptance.bat --build`, release-check output, changed file list

## Execution order

I'll ship in this order, smallest blast radius first:

```text
1. lib/chat-diagnostics.ts        (new — ring buffer of last N calls)
2. lib/error-mapping.ts           (new — friendly remediation strings)
3. components/ChatHealthCard.tsx  (new — home screen)
4. lib/preview-pipeline.ts        (new — orchestrates auto-fix loop)
5. components/ide/PreviewControls.tsx (extend existing PreviewHealthCard)
6. components/threed/SceneViewer  (verify + add duplicate/delete/align ops)
7. components/threed/AIAssistantPanel (attach reference image + scene context)
8. components/ModesSidebar        (collapse experimental into Advanced Tools)
9. components/settings/ReleaseCheckPanel.tsx (new)
10. lib/error-mapping wired into chat-api + agent fetches
11. scripts/acceptance.bat — extend with release-check + new regression guards
12. Build + acceptance + release-check
```

## Technical details

**chat-diagnostics.ts**
Ring buffer (last 50). Each entry: `{ id, role, provider, model, endpoint, fallbackReason, ms, error?, ts }`. Exposed via `recordCall(...)` and `getRecent()`. `chat-api.ts` calls `recordCall` after every request (success + failure).

**ChatHealthCard.tsx** (mounted on `/` Index page)
Reads `resolveModelSync('assistant')`, agent status, registry snapshot, last diagnostic entry. Compact 6-row grid: Assistant model, Provider, Agent, Ollama, GGUF, Voice, Last error.

**preview-pipeline.ts**
State machine: `idle → planning → generating → writing → starting → fixing(n) → ready | error`. `runBuild(prompt, opts)` orchestrates; on Vite/runtime error captured from agent response, calls app-builder model with error + file context, max 3 fixes. Keeps `lastGoodPreviewUrl` so UI doesn't blank out on fail.

**PreviewControls** — extend existing `PreviewHealthCard.tsx` with:
- `Stop Preview` button → POST `/preview/stop`
- `Copy Preview Logs` → fetch `/preview/logs?session=...` then clipboard
- (Restart, Copy URL, Copy Debug already exist)

**3D SceneViewer**
Already has TransformControls + snap (per earlier context). Add:
- `Duplicate` (Ctrl+D) — clone selected, offset +5 on X
- `Delete` (Del) — remove from scene
- Align toolbar buttons: Align X / Y / Z (snap to first selected position component)
- Union/Subtract (already implemented previously — verify)

Each op calls `regenerateScad()` and `onSceneChange()`.

**AIAssistantPanel (3D)**
Build payload `{ prompt, sceneJson, scad, selectedId, dimensions, constraints, referenceImage }`. If no vision model resolved (`resolveModelSync('vision').detected === null`) and image present → toast warning + omit image from payload but keep prompt.

**ModesSidebar**
Top-level keep: Chat, App Builder, IDE, 3D Printing, IoT, Models, Settings.
Move under collapsible `Advanced Tools`: Memory, OpenClaw, Task Graph, Sandbox, Plugins, System Helper, Learning Mode, Autonomous Mode.

**ReleaseCheckPanel**
Async checklist runner. Each check returns `{ name, ok, detail }`. Renders as colored list with Copy Report button.

**error-mapping.ts**
```ts
export function explainError(e: unknown, ctx: 'agent'|'ollama'|'gguf'|'preview'|'openscad'|'model'|'chat'): string
```
Returns the friendly remediation strings from section 8.

## Out of scope / intentionally skipped

- Renaming the npm package
- Brand new IoT workspace work
- Replacing the Auto-Build Panel (it already does steps 1–6 of the pipeline; the new `preview-pipeline.ts` is for App Builder preview specifically and reuses Auto-Build's parser).
- I will not run `npm run build` manually — the harness runs it automatically. I'll report what the harness shows.

## Acceptance signals

After each slice I'll either run a targeted check (rg / view / curl-equivalent) or fall back to a build-pass. Final pass:
- `acceptance.bat` and `acceptance.bat --build` lines added/updated to assert: no `gemini-flash` default, no `llama-3.2-1b` default, ChatHealthCard present, ReleaseCheckPanel present, preview-pipeline present.
- I'll list every file changed at the end.

If any slice gets stuck I'll stop and report rather than cascade more changes.