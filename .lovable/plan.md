

# Overhaul App Builder: Blackbox AI Backend, Live Preview During Streaming, Debug Panel

## Overview
Three major improvements: (1) add Blackbox AI as a backend provider with API key management, (2) make the preview update **while** the AI is still streaming code (like Lovable/Bolt), and (3) add a debug/console tab to the IDE right panel for troubleshooting.

---

## 1. Add Blackbox AI Backend

### `src/lib/chat-api.ts`
- Add `'blackbox'` to the `ChatSettings.backend` union type
- Add `blackboxApiKey` to the `APIKeys` interface
- Add `BLACKBOX_MODELS` array (e.g., `blackbox-ai`, `blackbox-ai-pro`)
- Add `sendBlackboxMessage()` function that calls the Blackbox API (OpenAI-compatible completions format at `https://api.blackbox.ai/v1/chat/completions`)
- Add `'blackbox'` case to `dispatchToBackend()`

### `src/components/SettingsDialog.tsx`
- Add a Blackbox backend button in the Backend tab (grid of provider cards)
- Add a Blackbox API Key input in the API Keys tab
- Add Blackbox to the model selector logic in `getAvailableModels()`

### `supabase/functions/chat/index.ts`
- Add Blackbox model mapping so the cloud edge function can also route to Blackbox when a `BLACKBOX_API_KEY` secret is present

---

## 2. Live Preview During Streaming (Like Lovable/Bolt)

Currently, the preview only updates **after** the full AI response is received. To match Lovable/Bolt behavior:

### `src/pages/IDE.tsx`
- During streaming (`onChunk` callback), incrementally parse the streaming content for complete code blocks using `parseCodeBlocks()`
- Track which blocks have already been applied (by file path + content hash) to avoid re-applying
- As each new complete code block appears in the stream, immediately apply it to the project files and trigger `generatePreview()`
- This means the preview updates file-by-file as the AI writes them, giving a real-time "building" feel

### Key logic:
```
let appliedPaths = new Set();
onChunk = (chunk) => {
  fullResponse += chunk;
  setStreamingContent(fullResponse);
  // Parse blocks from partial response
  const blocks = parseCodeBlocks(fullResponse);
  const newBlocks = blocks.filter(b => !appliedPaths.has(b.filePath + b.content.length));
  if (newBlocks.length > 0) {
    // Apply and regenerate preview
    applyCodeBlocks(...);
    generatePreview(...);
    newBlocks.forEach(b => appliedPaths.add(b.filePath + b.content.length));
  }
};
```

### `src/lib/preview-builder.ts`
- No changes needed — it already accepts `ProjectFile[]` and returns HTML

---

## 3. Add Debug Panel to IDE Right Panel

### `src/pages/IDE.tsx`
- Add a `'debug'` option to `rightPanelTab` state
- Add a Debug tab trigger in the right panel tabs bar
- Add a `TabsContent` for debug that shows:
  - Preview iframe console errors (captured via `window.addEventListener('message')` from the iframe)
  - List of applied files from the last AI response
  - Current preview generation status
  - Raw streaming content length / chunk count

### `src/components/ide/PreviewPane.tsx`
- Inject a `console.error` override script into the preview HTML that posts error messages back to the parent via `postMessage`
- Parent listens for these messages and adds them to the debug log

### `src/lib/preview-builder.ts`
- Add a small script to the generated HTML that overrides `console.error` and `window.onerror` to postMessage errors back to parent

---

## 4. Minor UX Improvements

### Preview toolbar (`PreviewPane.tsx`)
- The Refresh and Generate Preview buttons already exist — ensure the refresh button in `IDE.tsx`'s `onRefresh` actually calls `generatePreview()` instead of being a no-op (`() => {}`)
- Add a "Send to Preview" button in the code editor toolbar that manually triggers `generatePreview()`

### Terminal tab
- Already exists and functional — no changes needed

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/chat-api.ts` | Add Blackbox backend, API key, models, dispatch |
| `src/components/SettingsDialog.tsx` | Add Blackbox provider card + API key input |
| `src/pages/IDE.tsx` | Live preview during streaming; fix refresh handler; add debug tab |
| `src/components/ide/PreviewPane.tsx` | Add postMessage error capture from iframe |
| `src/lib/preview-builder.ts` | Add console.error/onerror bridge script to generated HTML |
| `supabase/functions/chat/index.ts` | Add Blackbox routing support |

