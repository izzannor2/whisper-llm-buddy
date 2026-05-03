## Goal
The live status bar (Agent / Build / Preview / CPU / RAM / Active Model) currently only appears on the home page (`src/pages/Index.tsx`). Make it visible on every workspace so it's there while you're actually building.

## Approach
Mount `SystemStatusBar` inside each page's existing top header so it inherits the page's layout and theming, instead of fighting per-page chrome with a global fixed bar.

## Changes

1. **`src/pages/IDE.tsx`** — header at line 444. Add `<SystemStatusBar />` on the right side of the existing header row, passing `buildState` derived from the IDE's loading/streaming state.

2. **`src/pages/IDESettings.tsx`** — header at line 229. Add `<SystemStatusBar />` to the right side.

3. **`src/pages/Models.tsx`** — header at line 309. Add `<SystemStatusBar />` next to existing actions.

4. **`src/pages/ImproveWorkspace.tsx`** — header at line 625. Add `<SystemStatusBar />`, wired to its generation state.

5. **`src/pages/SandboxWorkspace.tsx`** — header at line 161. Add `<SystemStatusBar />`.

6. **`src/pages/IoTWorkspace.tsx`** — header at line 218. Add `<SystemStatusBar />`.

7. **`src/components/SystemStatusBar.tsx`** — minor: add a `compact` prop that hides CPU/RAM badges on narrow headers (IDE/Improve/Sandbox/IoT use h-12 headers and can get crowded), so we can keep core indicators (Agent / Build / Preview / Model) always visible and let the homepage stay verbose.

## Notes
- No new global layout component needed — keeps each page's header design intact.
- All pages already have a flex header with a right-aligned action area, so insertion is a one-line addition each.
- `Auth.tsx` and `NotFound.tsx` are intentionally skipped (pre-login / error pages).