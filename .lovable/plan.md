

# Voice Call Mode → ChatGPT/Grok-Style Experience

## What You Asked For
1. Full chat interface during voice calls (see chat history while talking)
2. Screen viewing capability (share screen so AI can see what you're looking at)
3. Different interaction options/modes during the call
4. Keep it looking cool

## Current State
- Voice call works but takes over the ENTIRE screen with a centered "Listening..." / "Speaking..." indicator
- No chat history visible during the call — it's a blank overlay
- No screen sharing capability
- No mode options during the call
- Phone button correctly gates on Whisper model download (verified in browser)

---

## Changes

### 1. Redesign VoiceCallMode as a Split-Screen Interface
**File: `src/components/VoiceCallMode.tsx`**

Instead of a fullscreen centered overlay, redesign as a split layout:
- **Left panel (60%)**: Scrollable chat history showing the full conversation (both text and voice messages), with new voice messages appending in real-time as the call progresses
- **Right panel (40%)**: The voice call controls — animated orb/waveform, status indicator, push-to-talk button, and current transcript
- Top toolbar with mode selector, screen share toggle, and end call button
- Keep the dark backdrop but make it a proper layout, not just centered text

### 2. Chat History During Calls
- Pass the current conversation messages into VoiceCallMode
- As voice messages are sent/received, append them to the visible chat list
- User can scroll through past messages while the AI is speaking
- Show voice messages with a small microphone icon to distinguish from typed messages

### 3. Screen Viewing / Screen Share
- Add a "Share Screen" button in the voice call toolbar
- Uses `navigator.mediaDevices.getDisplayMedia()` to capture the screen
- Captures a screenshot periodically (every 5-10 seconds) or on-demand when the user asks
- Converts the frame to base64 and sends it alongside the next voice message as a multimodal input
- The cloud backend already supports Gemini models which handle image+text natively
- Show a small preview thumbnail of the shared screen in the call UI
- Note: This works with cloud models (Gemini) that support vision. Local models won't have this capability — show a tooltip explaining that.

### 4. Interaction Mode Selector During Call
Add a row of toggleable options in the call UI:
- **Auto-listen** (default) vs **Push-to-talk** — already exists, just resurface it
- **Screen Share** — on/off toggle
- **Text input** — small text field so user can type while in call mode (useful for sharing URLs, code, etc.)
- **Mute** — mute mic without ending call
- **Model selector** — dropdown to switch models mid-call (e.g., switch to Gemini Pro for complex questions)

### 5. Visual Polish
- Animated audio waveform/orb instead of static icons (CSS animation based on audio level from the existing analyser)
- Glassmorphism card for the controls panel
- Smooth transitions between states
- Dark theme with accent color pulsing during listening/speaking

### 6. Update Index.tsx Integration
- Pass `currentConversation.messages` to VoiceCallMode so it can display history
- VoiceCallMode now calls back with new messages that get added to the actual conversation (not just fire-and-forget)
- Same updates for IoT and Improve workspaces

### 7. Fix forwardRef Warning
- `App.tsx` has a ref warning — wrap ErrorBoundary component properly with forwardRef or remove the ref

---

## Files to Modify
- `src/components/VoiceCallMode.tsx` — Complete redesign with split layout, chat history, screen share, mode options
- `src/pages/Index.tsx` — Pass conversation messages, handle voice message persistence
- `src/pages/IoTWorkspace.tsx` — Same integration pattern
- `src/pages/ImproveWorkspace.tsx` — Same integration pattern
- `src/components/ErrorBoundary.tsx` — Fix forwardRef warning
- `supabase/functions/chat/index.ts` — Accept image data in messages for screen viewing (Gemini vision)

## Technical Notes
- Screen capture uses `getDisplayMedia()` API — works in Chrome, Edge, Firefox on desktop
- Image frames sent as base64 data URLs in the message content array (OpenAI/Gemini multimodal format)
- Audio waveform visualization uses the existing `AnalyserNode` that's already set up for silence detection
- Chat history panel uses the existing `ChatMessage` component for consistent rendering

