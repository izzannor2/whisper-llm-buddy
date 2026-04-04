
Fix the voice setup/state wiring rather than rebuilding anything.

What I found from the current code:
- `src/components/ChatInput.tsx` keeps a local `whisperAvailable` state, but `src/components/VoiceModelManager.tsx` never emits the `whisper-model-changed` event that ChatInput/IDE listeners are waiting for. Result: after downloading a model, the main chat can still think no model exists until a reload.
- `src/components/SettingsDialog.tsx` always opens on `backend` (`Tabs defaultValue="backend"`). The app dispatches `open-settings` with `{ tab: 'voicemodels' }`, but `src/pages/Index.tsx` only opens the modal and ignores the requested tab. Result: the “Open Settings” guidance is misleading.
- `src/pages/Index.tsx` still auto-restarts listening after TTS when `voiceConversation` is on. Even with `autoSendOnVoice={false}`, this can make main chat feel like it is “just going automatically”.
- `src/components/VoiceCallMode.tsx` uses a generic “download a voice model” message for all failures. It does not distinguish:
  - no downloaded model
  - selected model not actually ready
  - browser TTS unavailable
- Current readiness logic is inconsistent across files (`ChatInput`, `VoiceCallMode`, `VoiceModelManager`), so they can disagree about whether voice is ready.

Plan:
1. Unify voice readiness in `src/lib/local-stt.ts`
   - Add shared helpers for:
     - selected model id
     - whether the selected model is cached/ready
     - whether any cached fallback model exists
   - Centralize a small “voice state changed” event so every UI reads the same status.

2. Fix settings + model manager sync
   - Update `src/components/SettingsDialog.tsx` and `src/pages/Index.tsx` so `open-settings` can open the correct tab (`voicemodels`).
   - Update `src/components/VoiceModelManager.tsx` to emit voice-state updates after download, select, unload, and delete so chat buttons refresh immediately without reload.

3. Fix main chat mic behavior in `src/components/ChatInput.tsx`
   - Stop relying on stale `whisperAvailable` state alone.
   - Preflight the selected model before recording/transcribing, with fallback to an already cached model if appropriate.
   - Keep the main chat mic in “transcribe into text field for review” mode only.
   - Show accurate setup messages instead of the blanket “download another model” prompt.

4. Stop unwanted hands-free looping in main chat
   - Update `src/pages/Index.tsx` so the post-TTS `voiceConversation` auto-relisten path does not re-trigger the main chat mic review flow.
   - Keep this scoped to the main chat so AI Improvement’s intentional hands-free behavior is not changed.

5. Fix phone button / call gating in `src/components/VoiceCallMode.tsx`
   - Use the same shared readiness helpers as the main chat.
   - If a model is already cached, use that instead of falsely blocking.
   - Replace the generic toast with exact reasons when setup is incomplete.

Technical details:
- Files to modify:
  - `src/lib/local-stt.ts`
  - `src/components/VoiceModelManager.tsx`
  - `src/components/SettingsDialog.tsx`
  - `src/components/ChatInput.tsx`
  - `src/components/VoiceCallMode.tsx`
  - `src/pages/Index.tsx`
- No backend or database changes.
- Verification after implementation:
  1. Download/select a voice model, close settings, confirm mic + phone update immediately.
  2. Click the main mic, speak, confirm text lands in the textarea and does not auto-send.
  3. Click the phone button, confirm it opens the call UI instead of falsely asking for another model.
  4. Re-check that AI Improvement voice still keeps its separate hands-free behavior.
