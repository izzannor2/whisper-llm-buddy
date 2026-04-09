

# Complete System Upgrade — End-to-End Functional AI Companion

## Assessment: What Already Works
After a full audit, this project is **surprisingly complete**. Most of the 12 items listed are already implemented:

- **Microphone**: ✅ Live SpeechRecognition + Whisper fallback, start/stop, live transcription, error handling — all working
- **AI Backend**: ✅ 7 providers (Cloud/Ollama/Llama.cpp/OpenAI/Anthropic/Google/HuggingFace), streaming, memory, fallback — all working
- **Phone/Call**: ✅ Full VoiceCallMode with mic streaming, silence detection, waveform viz, push-to-talk, screen share — working (uses Whisper+TTS, not WebRTC since there's no remote peer)
- **TTS**: ✅ Browser SpeechSynthesis with voice selection, auto-play, read-back — working
- **Chat API**: ✅ Edge function at `/functions/v1/chat`, streaming, sessions via IndexedDB, memory store — working
- **Plugin System**: ✅ Registry with 3 built-in plugins, enable/disable, action execution — working
- **Memory**: ✅ Short-term (conversation) + long-term (memories table + localStorage fallback), retrieval for context injection — working
- **Export/Import**: ✅ Full JSON export/import of conversations, settings, memories, feedback, tool stats — working
- **Settings/Debug**: ✅ Full settings dialog with backend switching, voice models, API keys, debug panel with health checks — working

## What's Actually Missing or Incomplete

### 1. Update/Patch System (NOT built — critical request)
No versioning, patching, rollback, or update mechanism exists anywhere.

### 2. Voice Call lacks browser SpeechRecognition option
VoiceCallMode only uses Whisper (requires model download). It should also support browser SpeechRecognition for zero-setup calls.

### 3. Plugin UI in Settings is basic
The PluginManager component exists but isn't wired into the Settings dialog tabs.

### 4. Dead UI: "Restart AI Engine" button mentioned in settings but not implemented
### 5. Missing version display in UI

---

## Implementation Plan

### Phase 1: Update/Patch System (NEW — `src/lib/update-system.ts` + UI)

Create a complete client-side update system:

**`src/lib/update-system.ts`**:
- `AppVersion` interface with semantic versioning
- `currentVersion()` — reads from `localStorage` (default `1.0.0`)
- `checkForUpdates(manifestUrl)` — fetches a `version.json` manifest from a configurable URL
- `applyUpdate(patch)` — applies a patch object (changed settings, new plugin configs)
- `rollback()` — restores from backup saved before last update
- `getUpdateHistory()` — returns list of applied updates
- Automatic backup before every update (stores previous state in IndexedDB)

**`src/components/UpdatePanel.tsx`**:
- Current version display
- "Check for Updates" button
- Update history list with rollback buttons
- Manual version bump for local development

**Wire into Settings dialog** as a new "Updates" tab.

### Phase 2: VoiceCallMode — Add Browser SpeechRecognition Option

**`src/components/VoiceCallMode.tsx`**:
- Add a toggle: "Use Browser Speech" vs "Use Whisper (Offline)"
- When browser speech is selected, use `SpeechRecognition` API (same as ChatInput) instead of requiring Whisper download
- This removes the barrier: users can make voice calls immediately without downloading a model
- Keep Whisper as the offline fallback

### Phase 3: Wire Plugin Manager into Settings

**`src/components/SettingsDialog.tsx`**:
- Add "Plugins" tab that renders the existing `PluginManager` component
- Add a "Restart AI Engine" button in the System Status section that:
  - Hits Ollama `/api/tags` to warm it up
  - Shows success/failure toast

### Phase 4: Version Display + Polish

**`src/pages/Index.tsx`**:
- Add version badge in the sidebar footer (e.g., "v1.0.0")

**`src/components/ChatSidebar.tsx`**:
- Show app version at bottom of sidebar

### Phase 5: Stability Hardening

**`src/components/VoiceCallMode.tsx`**:
- Add retry logic when Whisper transcription fails (already partially there)
- Add graceful degradation message when no voice model and no browser SpeechRecognition

**`src/lib/chat-api.ts`**:
- Add toast feedback on 429/402 errors (already handled in edge function, ensure client surfaces them)

---

## Files to Create
| File | Purpose |
|------|---------|
| `src/lib/update-system.ts` | Version tracking, patch application, rollback, backup |
| `src/components/UpdatePanel.tsx` | Update UI with version display, history, rollback |

## Files to Modify
| File | Change |
|------|--------|
| `src/components/SettingsDialog.tsx` | Add "Updates" and "Plugins" tabs, "Restart AI Engine" button |
| `src/components/VoiceCallMode.tsx` | Add browser SpeechRecognition option alongside Whisper |
| `src/components/ChatSidebar.tsx` | Show version badge |
| `src/pages/Index.tsx` | Minor wiring for version display |

## What Won't Change
- Chat API layer (already complete with all 7 backends)
- Microphone in ChatInput (already fully working)
- TTS system (already complete)
- Memory system (already complete)
- Export/Import (already complete)
- Plugin registry (already complete, just needs UI wiring)
- Edge functions (already deployed and working)

