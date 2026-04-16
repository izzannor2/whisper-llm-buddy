

# Enhancements: Send to Preview Button, Blackbox Model Fetching, AI Improvement Mode Polish

## 1. Add "Send to Preview" Button in Code Editor Toolbar

**File: `src/components/ide/CodeEditor.tsx`**
- Add an `onSendToPreview` optional callback prop
- Add a "Send to Preview" button (with the `Send` icon) in the tab bar, right-aligned
- When clicked, calls `onSendToPreview()`

**File: `src/pages/IDE.tsx`**
- Pass `onSendToPreview={() => generatePreview()}` to `CodeEditor`

## 2. Blackbox API: Dynamic Model Fetching

Currently `BLACKBOX_MODELS` is hardcoded with 2 models. We need to try fetching available models from the Blackbox API when an API key is provided.

**File: `src/lib/chat-api.ts`**
- Add `fetchBlackboxModels(apiKey: string)` function that calls `https://api.blackbox.ai/v1/models` (OpenAI-compatible) and returns model list
- Keep `BLACKBOX_MODELS` as fallback if the fetch fails

**File: `src/components/SettingsDialog.tsx`**
- When Blackbox is selected and API key is present, call `fetchBlackboxModels()` to populate model dropdown dynamically
- Add a "Refresh Models" button next to the Blackbox model selector
- Show connection status indicator (green/red dot) after testing the key

## 3. AI Improvement Mode — Additional Action Buttons

The workspace already has Apply All, Apply Single, Diff, Fix Bugs, Optimize, Security, Polish UI, Add Features, and Refactor. Adding more useful buttons:

**File: `src/pages/ImproveWorkspace.tsx`**
- Add these new quick action buttons to `QUICK_SUGGESTIONS`:
  - **"Add Tests"** — Generate unit tests for selected files
  - **"Document"** — Add JSDoc/TSDoc comments to all functions
  - **"TypeScript Strict"** — Fix all `any` types and add proper typing
- Add a **"Preview Changes"** button in the header bar (next to Apply All) that builds preview from code blocks and switches to Preview tab
- Fix the preview: line 281 builds `html` but never sets it — add `setPreviewHtml(html)` and auto-switch to preview tab
- Add a **"Revert All"** button that clears `appliedFiles` state
- Add a **"Copy All Code"** button that copies all code blocks to clipboard

## 4. Debug Tab Verification

The debug tab in IDE.tsx (lines 502-522) already captures `preview-error` and `preview-log` messages from the iframe. The `preview-builder.ts` already injects the bridge script. This is working — no changes needed.

## Files Changed

| File | Change |
|------|--------|
| `src/components/ide/CodeEditor.tsx` | Add `onSendToPreview` prop and button in tab bar |
| `src/pages/IDE.tsx` | Pass `onSendToPreview` to CodeEditor |
| `src/lib/chat-api.ts` | Add `fetchBlackboxModels()` for dynamic model discovery |
| `src/components/SettingsDialog.tsx` | Dynamic Blackbox model list, refresh button, connection indicator |
| `src/pages/ImproveWorkspace.tsx` | New quick actions, preview fix, revert/copy buttons |

