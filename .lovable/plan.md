

# Improve Voice Call & Mic Button UX

## What You Asked For
1. **Phone call button**: Better hang up and mute controls — more visible, easier to use
2. **Mic button**: When clicked, transcribe speech into the text field so you can review before sending (not auto-send)

## Current State
- The voice call overlay already has mute and end-call buttons, but they're small icons in the top toolbar — easy to miss
- The mic button in the main chat already supports "type into field" mode, but it's controlled by `settings.voiceConversation` — if that's enabled, it auto-sends instead of letting you review

## Changes

### 1. Mic Button — Always Type Into Field First
**File: `src/pages/Index.tsx`**
- Change `autoSendOnVoice` to always be `false` so the mic button transcribes into the text field, letting you read and edit before hitting Send

### 2. Voice Call — Floating Controls at Bottom
**File: `src/components/VoiceCallMode.tsx`**
- Move the **Hang Up** and **Mute** buttons from the small top toolbar into a large, prominent floating control bar at the bottom of the screen (like FaceTime/Zoom call controls)
- Hang Up: large red circular button with phone icon
- Mute: large toggle button that clearly shows muted/unmuted state
- Keep the top toolbar for secondary controls (model selector, screen share, PTT toggle, text input toggle)
- Add a "Speaker Off" button to mute TTS output without ending the call

### Files to Modify
- `src/pages/Index.tsx` — Set `autoSendOnVoice={false}`
- `src/components/VoiceCallMode.tsx` — Redesign call controls layout with prominent bottom bar

