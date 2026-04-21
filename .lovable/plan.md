

# Three Small UX Wins: Reset Preview, Auto-Open Debug, Copy HTML

Surgical additions. No redesign. No new files.

## 1. AI Improvement — "Reset Preview" button

**File: `src/pages/ImproveWorkspace.tsx`**

In the right-pane header (visible when `rightTab === 'preview'`), add a **Reset Preview** button next to the existing Refresh button.

Behavior:
- Clears `appliedFiles` state (so the applied-status badges revert to "pending")
- Clears `previewError`
- Rebuilds the preview from the original parsed code blocks only (ignoring any local edits to applied files) by calling the existing `buildPreviewHTML` with the freshly parsed blocks
- Bumps `previewKey` so the iframe fully reloads
- Toast: `"Preview reset to original code blocks"`

Icon: `RotateCcw` from lucide-react (already imported elsewhere in file).

## 2. IDE — Auto-open Debug tab on preview error

**File: `src/pages/IDE.tsx`**

The `preview-error` postMessage handler (around lines 502–522) currently appends to `errors` but doesn't switch tabs. Update it:
- When a new error arrives AND the `autoOpenDebugOnError` setting is enabled AND `rightPanelTab !== 'debug'` → call `setRightPanelTab('debug')`.
- Read the setting from `ide-store` settings (new field `autoOpenDebugOnError`, default `true`).

**File: `src/lib/ide-store.ts`**

Add `autoOpenDebugOnError: boolean` to the settings interface and default initial state to `true`. Include in `validateSettings` (default true if missing/invalid).

**File: `src/pages/IDESettings.tsx`**

Add a new toggle row in the existing Editor/Workspace settings section:
- Label: **"Auto-open Debug tab on preview errors"**
- Description: "When the preview throws an error, automatically switch the right panel to the Debug tab."
- Bound to `settings.autoOpenDebugOnError` via the existing settings update flow.

## 3. IDE — "Copy preview HTML" button

**File: `src/components/ide/PreviewPane.tsx`**

Add an optional `onCopyHtml?: () => void` prop. When supplied AND `hasPreview` is true, render a `Copy` icon button in the toolbar (between Refresh and the External Link button). Tooltip: "Copy preview HTML".

**File: `src/pages/IDE.tsx`**

Wire it:
```ts
onCopyHtml={async () => {
  const html = previewHtml || (previewUrl ? await fetch(previewUrl).then(r => r.text()).catch(() => '') : '');
  if (!html) { toast({ title: 'No preview HTML available' }); return; }
  await navigator.clipboard.writeText(html);
  toast({ title: 'Preview HTML copied to clipboard' });
}}
```

## 4. Validation

- AI Improvement → Preview tab shows Reset Preview button; clicking clears applied badges and rebuilds iframe.
- IDE → trigger a preview error (e.g., reference an undefined component) → right panel auto-switches to Debug; toggle off in /settings → no auto-switch on next error.
- IDE → Preview pane shows Copy icon → clicking copies the current `previewHtml` to clipboard with a success toast.
- No new dependencies. No settings architecture changes. TypeScript clean.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/ImproveWorkspace.tsx` | Add Reset Preview button in right-pane header |
| `src/lib/ide-store.ts` | Add `autoOpenDebugOnError` setting (default true) |
| `src/pages/IDE.tsx` | Auto-switch to Debug tab on preview error (gated by setting); wire `onCopyHtml` |
| `src/pages/IDESettings.tsx` | Toggle for "Auto-open Debug tab on preview errors" |
| `src/components/ide/PreviewPane.tsx` | Add `onCopyHtml` prop and Copy icon button in toolbar |

