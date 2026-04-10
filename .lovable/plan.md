

# Local + Manual Update System Extension

## Summary
Extend the existing online-only update system to also support **local JSON update files** loaded via file upload (browser) or IndexedDB cache. Since this is a web app (not Electron/Node), we can't use `fs` to scan a `/updates` folder — instead we use a file input for importing local `.json` update files and persist them in IndexedDB as the "local updates library."

## Approach

### Why not filesystem scanning?
This is a browser-based Vite/React app. There's no Node.js `fs` access at runtime. The `/updates` folder can exist in the project for bundling sample update files, but runtime "scanning" must use one of:
- **File input** — user picks `.json` files from their local `/updates` folder
- **IndexedDB** — persist imported local updates so they survive reload
- **Fetch from `/updates/*.json`** — if we place static JSON files in `public/updates/`, Vite serves them and we can fetch a known manifest

**Strategy**: Use all three. Ship a `public/updates/manifest.json` that lists available local update files. On startup, fetch that manifest. Users can also import additional `.json` files via a file picker. All local updates are cached in IndexedDB.

## Changes

### 1. Create `public/updates/manifest.json` (sample)
```json
{
  "updates": []
}
```
A static file listing bundled local updates. Users can add files here when building the project.

### 2. Extend `src/lib/update-system.ts`
Add:
- `LocalUpdate` interface: `{ version, changes, timestamp, patches? }`
- `getLocalUpdates()` — reads from IndexedDB store `local-updates`
- `saveLocalUpdate(update)` — saves to IndexedDB
- `removeLocalUpdate(version)` — removes from IndexedDB
- `scanBundledUpdates()` — fetches `public/updates/manifest.json`, loads listed files
- `importLocalUpdateFile(file: File)` — parses a `.json` file, validates, saves to IndexedDB
- `getMergedUpdateList()` — combines local + applied history into one sorted list
- `applyLocalUpdate(update)` — converts a `LocalUpdate` to an `UpdateManifest` and applies it

### 3. Rewrite `src/components/UpdatePanel.tsx`
Reorganize into three sections with tab-like headers:
- **Current Version** — existing version display + bump buttons
- **Online Updates** — existing manifest URL + check button (unchanged)
- **Local Updates** — new section:
  - List of imported local update files (from IndexedDB) sorted by version
  - "Import Update File" button (file input for `.json`)
  - Each local update shows version, timestamp, changes list, and "Apply" / "Remove" buttons
  - Applied updates are marked
- **Reload Updates** button — re-scans bundled updates + refreshes IndexedDB list
- **Rollback** — existing rollback section (unchanged)
- **History** — existing history section, now shows source tag (local vs online)

### 4. Fallback logic
In `handleCheck` (online check):
- If online fetch fails, automatically load local updates and show them as available
- Toast: "Online check failed — showing local updates"

## Files

| File | Action |
|------|--------|
| `public/updates/manifest.json` | Create — empty bundled updates manifest |
| `src/lib/update-system.ts` | Extend — add IndexedDB local update store, import/scan/merge functions |
| `src/components/UpdatePanel.tsx` | Extend — add Local Updates section, import button, reload button |

## What stays the same
- All existing online update logic (checkForUpdates, applyUpdate, rollback, backup, history)
- Version tracking and persistence
- Deep merge patching
- Settings dialog wiring

