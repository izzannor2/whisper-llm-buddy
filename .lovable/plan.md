## Goal

Make sure the whole stack — `RUN-ALL.bat`, the local agent, the 3D Printing mode, and the acceptance/smoke tests — actually exercises the new 3D routes and reports clearly when something is missing.

The frontend, backend handlers, and UI workspace already exist and are wired correctly. The remaining gaps are in **test coverage and launcher verification** for the 3D pipeline.

## Changes

### 1. `scripts/route-smoke-test.mjs`
- Add `/3d` to the `ROUTES` array so the SPA smoke test confirms the 3D workspace is reachable after `vite build`.

### 2. `scripts/acceptance.bat`
Add backend route checks for the 3D pipeline (run only when agent is up; reuse existing `:check_url` helper):
- `GET /3d/status` → 200
- `GET /3d/diagnostics` → 200
- `GET /openscad/status` → 200
- `POST /3d/save-scad` (with a tiny inline JSON body via `curl -d`) → 200, then verify `projects/3d/acceptance_test/model.scad` exists.
- `POST /openscad/render` → 200 **or** 422 (422 is the correct "OpenSCAD CLI not installed" response and must NOT be treated as a failure).
- After render, assert `projects/3d/acceptance_test/model.stl` does **not** exist when the response was 422 (no fake STL).
- Add `[PASS] file exists: src\pages\ThreeDWorkspace.tsx` and `src\components\threed\AcceptanceChecklist.tsx` to the existing `:check_file` block.

Add a new helper `:check_url_2xx_or_422` for the render endpoint so a missing-OpenSCAD environment still passes.

### 3. `RUN-ALL.bat`
Add one line in the "Verify health endpoints" section:
- `curl -s --max-time 2 http://127.0.0.1:3847/3d/status` → reports `[OK] /3d/status` or `[WARN]`.

This makes the launcher surface 3D backend health on every start.

### 4. `src/lib/diagnostics.ts` (sanity)
Confirmed already includes `threeDStatus` and `threeD`. No change needed unless a key is missing — verify on implementation.

### 5. No changes needed to:
- `server/index.cjs` — all four routes (`/3d/status`, `/3d/save-scad`, `/3d/diagnostics`, `/openscad/status`, `/openscad/render`, `/3d/export-stl`) are implemented and use `PROJECT_ROOT` + shared `renderStlHandler`.
- `src/pages/ThreeDWorkspace.tsx` — workspace, prompt, templates, editor, voice controls, STL viewer, and acceptance checklist are wired.
- `src/components/ModesSidebar.tsx` / `src/pages/Index.tsx` — `3d-printing` mode is visible and routes to `/3d`.

## Verification after implementation

1. `RUN-ALL.bat` boots and prints `[OK] /3d/status`.
2. Visiting `/3d` shows prompt box, templates, editor, voice controls, STL viewer placeholder, and the collapsible Acceptance Tests panel.
3. `scripts\acceptance.bat` (with agent running, OpenSCAD absent) returns `RESULT: PASS` — including the 3D rows and the "no fake STL" assertion.
4. `node scripts/route-smoke-test.mjs` returns PASS for `/3d`.

## Notes for non-technical readers

This pass doesn't add new features — it makes the existing one-click launcher and test scripts actually check the 3D Printing mode end-to-end, so a broken install is caught immediately instead of surfacing later as "Failed to fetch" in the browser.
