# Live 3D Editor Upgrade

Transform `/3d` from a generate→export→preview flow into a real live editing workspace where SCAD edits auto-render and the STL viewer has full inspection controls.

## 1. Editable SCAD with Live Preview (`ThreeDWorkspace.tsx`)

- Replace the read-only `<pre>` with a `<Textarea>` (monospace) bound to `scad`.
- Add a **Live Preview** `Switch` (default ON) in the editor header, persisted to `localStorage` (`threed.livePreview`).
- New pipeline state: `'editing' | 'validating' | 'rendering' | 'ready' | 'error'` shown as a small status row alongside the existing `StatusPill`.
- Debounce SCAD changes 1500ms (`useEffect` + `setTimeout`):
  1. `validateScad` → if errors, status `error`, show inline list, skip render.
  2. `renderStl` POST `/openscad/render`, parse returned bytes.
  3. On success: update `stl`, `lastRender`, status `ready`.
  4. On failure: status `error`, show stderr; **keep previous `stl`** so last good preview stays visible (track `staleRender = true`).
- Manual **Render** button stays and works regardless of toggle (forces an immediate render, bypasses debounce).
- Inline validation panel under the editor lists `validateScad` errors.
- Render error panel shows: stderr (from `X-Openscad-Stderr` already returned by `server/index.cjs`), and a "failing line" parsed via regex `/line (\d+)/i` from stderr when present.

## 2. Upgraded STL Viewer (`StlViewer.tsx`)

Add a controls bar (overlay, top-right) and props for each toggle. Internally keep refs to `mesh`, `controls`, `grid`, `axes` for live toggling without re-mounting the scene.

Controls:
- Reset camera (recompute from boundingSphere).
- Fit to model (same, with padding factor).
- Auto-rotate toggle (`controls.autoRotate`).
- Wireframe toggle (swap material to `MeshBasicMaterial({ wireframe: true })` or toggle `material.wireframe`).
- Solid/shaded toggle (flat vs. standard material).
- Grid toggle (`grid.visible`).
- Axis helper toggle (add/remove `THREE.AxesHelper(50)`).

Avoid re-creating the renderer on prop changes — only `stl` triggers geometry replacement; toggles mutate existing objects.

## 3. Model Inspection & Printability Panel

New component `ModelInspector.tsx` rendered below the viewer (collapsible card). Computes from the parsed `BufferGeometry` (passed up via `onInfo`, extended):
- Bounding box (x/y/z mm).
- Vertex count, triangle count (`position.count / 3`).
- STL byte size (KB).
- **Estimated volume**: signed tetrahedron sum over triangles → `Math.abs(sum)/6` mm³, plus cm³.
- **Empty mesh warning** if 0 verts.
- **Thin-wall warning**: configurable threshold input (default 1.2mm). Approximation: warn if smallest bbox dimension < threshold. Labeled "approximate".
- **Manifold check**: placeholder line "Manifold check not available (requires mesh analysis library)".

Extend `StlViewerInfo` with `triangles`, `volumeMm3`.

## 4. Render Pipeline & Debug

- `renderStl` already returns `{ stl, bytes, contentType, stlPath, stderr, error }` — no change needed.
- **Copy 3D Debug** button updated to include: scad, scad bytes, status, stderr, stl bytes, content-type, stl path, viewer parse error, vertices, triangles, bbox, volume, livePreview flag, last validation errors, backend `/3d/status` snapshot (fetched at click time).

## 5. Acceptance tests (`AcceptanceChecklist.tsx` + `scripts/acceptance.bat`)

Extend the in-app `AcceptanceChecklist` with manual checks for:
- Live Preview toggle persists.
- Editing SCAD triggers auto-render within ~2s.
- Wireframe / grid / axes / auto-rotate toggles flip viewer state.
- Reset camera & Fit to model recenter.
- Bounding box & triangle count appear after render.
- Failed render keeps last successful preview visible (stale badge shown).

No new backend endpoints required — `/openscad/render` already returns STL bytes with the headers we need.

## Technical notes

- Files edited: `src/pages/ThreeDWorkspace.tsx`, `src/components/threed/StlViewer.tsx`, `src/components/threed/AcceptanceChecklist.tsx`.
- New file: `src/components/threed/ModelInspector.tsx`.
- No new deps (three + STLLoader + OrbitControls already in use).
- Debounce implemented with `useRef<number>` + `window.setTimeout`; cleared on unmount and on manual render.
- Stale-preview indicator: small amber badge "stale" in the preview status row when `staleRender` is true.
- Live preview disabled automatically while a render is in flight to avoid request stacking; queued change re-runs after completion.
