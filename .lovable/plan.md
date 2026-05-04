
# Refinement + 3D Printing Pass

## 1. Mode Cleanup

Collapse the mode list in `ModesSidebar.tsx` and `ide-types.ts` to six top-level modes:

- App Builder (`app-builder`)
- IDE / Coding (`ide-coding` — new id; replaces "Chat" entry, used for general coding chat)
- AI Improvement (`ai-improvement`)
- Embedded / IoT (`embedded-iot`)
- 3D Printing (`3d-printing` — new)
- Advanced (group containing: System Helper, Sandbox, Plugin, Advanced Prompt Override, Learning)

Implementation:
- Add `'3d-printing'` and `'ide-coding'` to `IDEMode` union and `MODE_INFO`.
- In `ModesSidebar`, render the six primary entries flat, then a collapsible "Advanced" section (using existing `Collapsible` UI) containing the relocated modes.
- Remove the standalone "Chat" pseudo-entry (it was just app-builder remap) — IDE/Coding takes its place.
- Update `MODES_LIST`, `MODE_ICONS`, and any `currentMode` checks. Keep legacy ids functional via a small migration in `ide-store.ts` (e.g. map old `system-helper` selection to still work if persisted).

## 2. Settings as Single Source of Truth

Audit and consolidate. All of these must live only inside `IDESettings` / Settings page tabs:

- Model routing (currently `ModelRoutingPanel` — embed in Settings → "Routing" tab)
- Jailbreak / override (Settings → "Advanced")
- Backend (ollama / llama.cpp / cloud — Settings → "Backend")
- Voice (Settings → "Voice")

Actions:
- Remove inline routing/override/backend toggles from the chat header, sidebar footer, and any panel that duplicates them. Replace with a "Open Settings → <Tab>" deep link using the existing `Settings Deep Linking` event.
- The sidebar footer keeps only: Online/Offline status badge + Settings button.

## 3. New Mode: 3D Printing

New files:

- `src/pages/ThreeDWorkspace.tsx` — the workspace route (`/3d`).
- `src/lib/openscad.ts` — code helpers: prompt → OpenSCAD via Lovable AI, validate, save.
- `src/lib/stl-export.ts` — calls local agent (port 3847) to run `openscad -o file.stl file.scad`.
- `src/components/threed/ScadPromptPanel.tsx` — prompt + template buttons.
- `src/components/threed/ScadCodePanel.tsx` — generated `.scad` source with copy/download.
- `src/components/threed/StlViewer.tsx` — three.js viewer (loads `STLLoader`).
- `src/components/threed/OpenScadInstall.tsx` — install instructions when CLI absent.

Behavior:
- AI generates OpenSCAD source via existing Lovable AI gateway (edge function `chat`, system prompt: "Output valid OpenSCAD only").
- Files saved under `/projects/3d/<name>/model.scad` through the local agent's file API; download works via Blob in the browser too (no agent required).
- Optional STL conversion: agent endpoint `POST /openscad/render` runs `openscad -o out.stl in.scad`. If the binary is missing, surface the install panel.
- Does NOT touch the existing preview iframe / Vite preview server.

Add route in `App.tsx`:
```tsx
const ThreeDWorkspace = lazy(() => import('./pages/ThreeDWorkspace'));
<Route path="/3d" element={<ThreeDWorkspace />} />
```

## 4. 3D UI Layout

`ThreeDWorkspace` layout (resizable horizontal split):

```text
+----------------------+--------------------------+
| Prompt + Templates   |  3D Preview (STL viewer) |
| (gear, enclosure,    |                          |
|  RC parts, mount,    |                          |
|  bracket, knob)      +--------------------------+
| Status indicator     |  Generated .scad code    |
|                      |  + Download .scad / .stl |
+----------------------+--------------------------+
```

Templates are one-click prompt seeds (e.g. "Parametric spur gear, 20 teeth, 5 mm bore").

## 5. STL Export Path

Local agent (`server/index.cjs`) gets new endpoint:
```js
POST /openscad/render  { scad: string, name: string }
  -> spawn 'openscad', ['-o', `${name}.stl`, '-']
  -> returns { ok, stlPath } or { ok:false, missing:true }
```

Detection via `GET /openscad/status` running `openscad --version`. If missing, the UI shows `OpenScadInstall` with platform-specific commands (`winget install OpenSCAD.OpenSCAD`, `brew install --cask openscad`, `apt install openscad`).

## 6. Auto-Fix Loop (App Builder + 3D Printing)

New helper `src/lib/auto-fix.ts`:

```text
generate(prompt) -> code
loop up to 3 times:
  validate(code)               // build for app-builder, syntax for OpenSCAD
  if ok: break
  code = aiFix(code, errors)   // re-prompt with errors
return { code, attempts, fixed }
```

- App Builder validation hooks into existing `build-pipeline.ts` errors.
- 3D validation: try OpenSCAD CLI dry-run when present; otherwise a lightweight regex/syntax check.

## 7. Status Indicators

Single shared component `src/components/StatusPill.tsx` with states: `idle | thinking | generating | fixing | done | error`. Used in App Builder header and 3D workspace. Drives off the existing chat streaming + auto-fix events.

## 8. Model Recommendations

`src/lib/model-recommendations.ts`:
- Inputs: active mode, hardware capability score (already computed by Model Capability Scoring memory).
- Output: ordered recommended model ids per backend (ollama / llama.cpp / cloud).
- Example: 3D Printing on low-RAM box → `qwen2.5-coder:3b` local or `google/gemini-3-flash-preview` cloud.
- Surfaced as a "Recommended" badge inside the model dropdowns in Settings → Backend, and a one-line hint in each workspace.

## 9. Project Structure

Standardize outputs under `./projects/`:

```text
projects/
  apps/<project-name>/
  code/<snippet-or-script>/
  3d/<model-name>/
```

- Update `project-export.ts` and the local agent file root to use these subfolders.
- Existing exports get migrated lazily (move on first save, otherwise leave).

## 10. Remove Unused / Duplicated UI

After audit, remove or consolidate:
- Duplicate routing/backend toggles outside Settings (see §2).
- The "Chat" pseudo-mode entry (replaced by IDE/Coding).
- Any tab content shells that render nothing in the right pane.
- Unused imports / dead `MODE_INFO` keys after the cleanup.

## Files Touched (summary)

- Edit: `src/lib/ide-types.ts`, `src/lib/ide-store.ts`, `src/components/ModesSidebar.tsx`, `src/App.tsx`, `src/pages/IDESettings.tsx`, `src/pages/IDE.tsx`, `src/components/SettingsDialog.tsx`, `src/components/ModelRoutingPanel.tsx`, `server/index.cjs`, `src/lib/project-export.ts`.
- Add: `src/pages/ThreeDWorkspace.tsx`, `src/lib/openscad.ts`, `src/lib/stl-export.ts`, `src/lib/auto-fix.ts`, `src/lib/model-recommendations.ts`, `src/components/StatusPill.tsx`, `src/components/threed/*` (4 files).
- Remove/inline: duplicate routing/backend controls outside Settings, "Chat" sidebar entry.

## Out of Scope

- No new auth, no DB schema changes.
- No changes to the Vite preview server or existing IDE preview iframe.
- Brave / web search behavior stays as-is (offline by policy).
