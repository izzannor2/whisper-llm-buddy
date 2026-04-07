

# ChatGPT-Style Mic: Live Transcription + Read-Back

## What You Want
1. Click mic → it starts listening and **words appear live** in the text field as you speak
2. Click mic again → stops listening
3. Review the transcribed text, edit if needed
4. Optional: click a "Read Back" button to hear the message spoken aloud via TTS
5. Then hit Send when ready

## Current Problem
The mic currently records a full audio blob silently, then batch-transcribes it all at once after you stop. No live feedback — you speak into silence, wait, then text appears. The Volume2 button does nothing.

## Approach

### Use Browser SpeechRecognition for Live Streaming
Whisper (local) only supports batch transcription — it can't stream live. But the browser's built-in `webkitSpeechRecognition` API provides real-time interim results that appear word-by-word. This is exactly how ChatGPT's mic works.

**Strategy**: Use `SpeechRecognition` as the **primary** mic input (live words in textarea), with Whisper as a **fallback** for offline/unsupported browsers.

### 1. Rewrite `startLocalRecording` → `startLiveTranscription`
**File: `src/components/ChatInput.tsx`**
- Create a `SpeechRecognition` instance with `interimResults = true` and `continuous = true`
- On `onresult`: update the textarea in real-time with interim text (gray placeholder feel), then commit final results
- Track a `liveTranscript` ref that accumulates final results and shows interim text
- If `SpeechRecognition` is unavailable (offline), fall back to current Whisper batch flow
- Click mic = start, click again = stop — no auto-send, text stays for review

### 2. Wire up the Volume2 button as "Read Back"
**File: `src/components/ChatInput.tsx`**
- The existing Volume2 button (line 465-467) currently does nothing
- Make it call `speak(message)` from `src/lib/tts.ts` to read the current textarea content aloud
- Show it only when there's text in the field
- While reading, show a stop icon; click again to stop playback

### 3. Visual feedback during live transcription
- While recording: mic button pulses red (already done)
- Textarea shows live interim text as it's spoken
- A subtle "Listening..." label appears below the textarea

## Files to Modify
- `src/components/ChatInput.tsx` — Replace batch recording with live SpeechRecognition, wire Volume2 as read-back button

## What Stays the Same
- Whisper still used for voice call mode and offline scenarios
- Send button behavior unchanged
- All other toolbar buttons unchanged

