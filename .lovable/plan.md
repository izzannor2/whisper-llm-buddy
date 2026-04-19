

# Cleanup Plan — Remove Simulated Behavior, Tighten ImproveWorkspace

Scope per your choice ("only do the safe parts"). Settings architecture untouched. No files referenced in your original instructions exist in this repo — I'm only touching what's actually here.

## 1. `src/lib/local-backend-agent.ts` — Remove simulated success
- **Delete** `simulateCommand()` and `simulateDevServer()`.
- `executeCommand`: when agent disconnected, return `{ success: false, output: '', error: 'Local agent not connected. Start the agent on port 3847 to run commands.' }`.
- `startDevServer`: when disconnected, return `null` (already does on fetch failure — make disconnected branch consistent and honest).
- `writeProjectFiles`: when disconnected, return `false` instead of logging "[Simulated]" and returning `true`.
- Keep all real connected-path logic, listeners, status, and `generateAgentScript()` untouched.

## 2. `src/lib/system-commands.ts` — Honest preview-only behavior
- `executeCommand(SystemCommand)`: stop marking simulated runs as `completed`. Try the real local agent first via `local-backend-agent.executeCommand`. 
  - If agent connected → return real `output`/`error` and status `completed` or `failed`.
  - If agent NOT connected → return status `failed` with output `"PREVIEW ONLY — NOT EXECUTED. Local agent not connected (port 3847)."` Do not falsely mark as completed.

## 3. `src/lib/preview-builder.ts` — Stop hiding errors with fake stubs
- Replace `generateComponentStubs()` with a function that still scans for undeclared capitalized identifiers, but instead of silently injecting working stub components, it:
  - Emits a single visible **error banner** at the top of the preview body listing the missing components ("Missing components: Footer, Hero — define these or import them.").
  - Pre-declares the missing names as components that render an inline red error badge (`⚠ <Name> is not defined`) — enough to prevent the whole preview from white-screening, but visually loud and clearly an error, not a working placeholder.
- Remove the runtime `window.addEventListener('error', ...)` auto-stub fallback (lines ~830–845) — it silently masks real ReferenceErrors. Keep only the postMessage error-bridge for the Debug tab.
- Keep TS stripping, library shims, `srcdoc` pipeline, file flattening, and the postMessage console/error bridge intact.

## 4. `src/pages/ImproveWorkspace.tsx` — Tighten action-button UX
- **Top action bar**: clearer hierarchy.
  - Primary (filled, prominent): **Send / Improve** (or **Plan** when planning mode is on).
  - Secondary (outline): **Diff**, **Preview Changes**.
  - Apply group (right side, outline + filled CheckCheck): **Apply Selected**, **Apply All**.
  - Utility group (icon-only, ghost): **Copy All Code**, **Revert All**.
- **Disabled/loading states**:
  - Apply buttons disabled when no parsed code blocks exist or while applying.
  - Send disabled while streaming; show spinner inside the button.
  - Apply buttons show a brief "Applied ✓" state for 1.5s after success, then revert. Track an `isApplying` ref to block duplicate clicks.
- **Labels**: "Apply All" → "Apply All Changes (N files)"; "Diff" → "Show Diff"; "Preview" tab label stays.
- **Selected-file state**: highlight selected file row with a left border accent + count badge ("3 files selected") in the header.
- **Empty states**:
  - No code blocks parsed → small inline note in apply area: "No code changes detected yet. Ask the AI to suggest improvements."
  - No files selected → quick-suggestion buttons stay enabled but show tooltip "Select files first for targeted improvements".
- **Honest success**: never show "Improvement complete!" toasts unless code blocks were actually parsed and applied. Toast wording: "Applied N file(s)" or "No changes to apply".
- Keep pink theme, layout, file tree, chat panel, voice flow, and all existing data flow as-is.

## Files Changed
| File | Change |
|------|--------|
| `src/lib/local-backend-agent.ts` | Remove simulate functions; honest error returns when disconnected |
| `src/lib/system-commands.ts` | Route to real agent; mark unavailable runs as `failed` with PREVIEW ONLY label |
| `src/lib/preview-builder.ts` | Replace silent stubs with visible error banner + inline error badges; remove auto-stub error listener |
| `src/pages/ImproveWorkspace.tsx` | Tighten top action bar, button hierarchy, disabled/loading states, honest toasts, clearer empty/selected states |

## Not touched (per your "safe parts only" choice)
- `src/pages/IDESettings.tsx`, `src/components/SettingsDialog.tsx`, `src/pages/Index.tsx`, `src/App.tsx`, routing, ChatSidebar, IDE preview pipeline structure, all stores.

