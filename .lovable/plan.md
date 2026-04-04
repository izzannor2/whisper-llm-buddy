

# Polish Pass: Model Dropdown, Web Search, and Settings UX

## What You Asked For
1. Internet toggle (globe button) for live web search — make sure it actually works
2. Model dropdown right in the chat input bar (no need to open Settings to switch models)
3. Settings improvements — cleaner, easier to navigate
4. General polish — everything working end-to-end

## Current State Assessment
- **Web search toggle**: Already wired — globe button toggles `webSearchEnabled`, which calls the `web-search` edge function via DuckDuckGo. The edge function exists and works. The search context gets injected into the system prompt. This should be functional already.
- **Model switching**: Currently the model name button in ChatInput opens Settings. No inline dropdown to quickly switch models/backends.
- **Settings**: 9 tabs crammed into a single row — hard to navigate on smaller screens. Backend tab works but requires Save to apply.

## Changes

### 1. Inline Model/Backend Dropdown in Chat Input
**File: `src/components/ChatInput.tsx`**
Replace the current model name button (line 216-221) that just opens Settings with a proper `DropdownMenu`:
- Show current backend + model name as the trigger
- Dropdown sections: Cloud models, Ollama models (auto-scanned), Llama.cpp, API providers
- Selecting a model instantly updates `settings.backend` + `settings.model`/`settings.ollamaModel` and saves
- "More options..." item at bottom opens full Settings
- Requires new props: `onBackendChange`, `availableOllamaModels` (or we read settings directly)

**File: `src/pages/Index.tsx`**
- Pass model change handler to ChatInput that updates settings + saves immediately
- Auto-scan Ollama models on mount (with a ref to avoid repeated scans) and pass the list down

### 2. Verify Web Search Works End-to-End
**File: `supabase/functions/web-search/index.ts`** — Already deployed, no changes needed unless testing reveals issues.
**File: `src/pages/Index.tsx`** — Already injects search context (lines 282-292). Verify the toggle state flows correctly. Add a small toast or indicator when search results are found so the user knows it's working.

### 3. Settings Dialog Cleanup
**File: `src/components/SettingsDialog.tsx`**
- Group the 9 tabs into fewer sections using a scrollable `TabsList` or a 2-row layout
- Add `DialogDescription` to fix the console warning about missing description
- Auto-save on change instead of requiring a manual Save button click (debounced)
- When Ollama is selected, auto-scan immediately and show models inline

### 4. Minor Fixes
- Fix `DialogContent` missing description warning (add `aria-describedby` or `DialogDescription`)
- Suppress the Ollama "Failed to fetch" error on cloud preview (it already has `isCloudPreview()` check but the error still fires from the auto-scan on mount in Index.tsx)

## Files to Modify
- `src/components/ChatInput.tsx` — Add inline model dropdown replacing the settings-open button
- `src/pages/Index.tsx` — Pass model switch handler, scan Ollama on mount, show search feedback
- `src/components/SettingsDialog.tsx` — Add DialogDescription, clean up tab layout, auto-save
- `src/lib/chat-api.ts` — No changes needed

## Technical Details
- The inline model dropdown reads from `loadSettings()` for the current backend and uses `saveSettings()` directly for instant persistence
- Ollama scan uses the existing `fetch(ollamaUrl + '/api/tags')` pattern with a 3-second timeout
- Cloud models are always shown; Ollama models only appear if scan succeeds; API provider models only if keys are set
- Web search feedback: after search completes, if results found, show a subtle "Found N results" indicator near the globe button

