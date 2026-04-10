

# Stability & Correctness Pass — Fix Real Issues Only

## Issues Found

### 1. Update System
- **Version persists correctly** — uses `localStorage`, already works across reloads
- **Rollback works** — restores settings + version from backup
- **Settings merge is shallow** (`{...current, ...patch}`) — nested objects get overwritten. Need deep merge.
- **No validation of manifest JSON** — malformed/missing fields will silently fail or crash

### 2. SpeechRecognition (ChatInput)
- **Multiple instances possible**: `startLiveTranscription` creates a new `SpeechRecognition` without stopping/aborting a previous one if `recognitionRef.current` already exists
- **`onend` auto-restart gap**: When browser auto-ends recognition (e.g., silence timeout), `onend` fires and sets `isRecording=false` but doesn't auto-restart — this is fine for ChatInput (user manually toggles), but needs guarding against stale refs
- **No cleanup of `recognitionRef` on component unmount** — missing cleanup effect

### 3. SpeechRecognition (VoiceCallMode)
- **Multiple instances possible**: `startBrowserListening` creates a new recognition without aborting previous `speechRecognitionRef.current`
- **Error handler incomplete**: Only handles `no-speech`, not `aborted`, `network`, `audio-capture` errors
- **Stream leak on error**: If `recognition.start()` throws, the `getUserMedia` stream is never stopped

### 4. Plugin System Reactivity
- Plugin registry uses an in-memory `Map` — `togglePlugin()` mutates it but nothing triggers a React re-render. The PluginManager UI needs to use local state + force update after toggle.

### 5. Restart AI Engine
- Already makes real network requests with `AbortSignal.timeout(3000)` — **this is correct**
- Missing: visual loading state on the button during the request

### 6. Version Badge (ChatSidebar)
- Uses raw `localStorage.getItem('localdev-app-version')` inline — correct key, but hardcoded fallback `'v1.0.0'` should use `getCurrentVersion()` for consistency and to respect `DEFAULT_VERSION`

## Plan

### File: `src/lib/update-system.ts`
- Add `deepMerge` utility for settings patching (replace shallow spread)
- Add manifest validation in `applyUpdate` — check `version`, `patches` array exist, skip invalid entries gracefully
- Add try/catch around individual patch applications so one bad patch doesn't abort all

### File: `src/components/ChatInput.tsx`
- In `startLiveTranscription`: abort existing `recognitionRef.current` before creating new instance
- Add cleanup `useEffect` that aborts recognition + stops media recorder on unmount
- Guard `stopRecording` against already-stopped state

### File: `src/components/VoiceCallMode.tsx`
- In `startBrowserListening`: abort existing `speechRecognitionRef.current` before creating new one
- Add error handling for `audio-capture`, `network`, `aborted` errors
- Wrap `recognition.start()` in try/catch that cleans up the stream on failure

### File: `src/components/ChatSidebar.tsx`
- Import `getCurrentVersion` from update-system and use it instead of raw localStorage read

### File: `src/components/SettingsDialog.tsx`
- Add loading state (`isRestarting`) to the Restart AI Engine button so it shows a spinner during the request

### File: `src/components/ide/PluginManager.tsx`
- Check current toggle behavior — ensure it uses local state that re-renders on toggle (may need `useState` + callback pattern instead of relying on the mutable Map)

## Files to Modify
| File | Change |
|------|--------|
| `src/lib/update-system.ts` | Deep merge for settings, manifest validation |
| `src/components/ChatInput.tsx` | Prevent duplicate SpeechRecognition, add unmount cleanup |
| `src/components/VoiceCallMode.tsx` | Prevent duplicate SpeechRecognition, better error handling, stream cleanup |
| `src/components/ChatSidebar.tsx` | Use `getCurrentVersion()` import |
| `src/components/SettingsDialog.tsx` | Loading state on Restart button |
| `src/components/ide/PluginManager.tsx` | Ensure toggle triggers re-render |

