

# Add Voice Call Button & Verify All Modes

## What We're Building
A phone button (like ChatGPT/Grok) in the main chat input area that launches a full-screen voice conversation mode — speak back and forth with the AI hands-free.

## Current State
- `VoiceCallMode.tsx` already exists with full functionality (Whisper STT, browser TTS, push-to-talk, silence detection, conversation loop)
- It is **not wired up anywhere** — never imported or rendered in any page
- `ChatInput.tsx` has a mic button for dictation but no phone/call button
- `Index.tsx` has `handleVoiceCallMessage` already defined but unused

## Changes

### 1. Add Phone Button to ChatInput
**File: `src/components/ChatInput.tsx`**
- Import `Phone` icon from lucide-react
- Add a new prop `onVoiceCall` callback
- Place a phone button next to the existing mic button in the input toolbar
- Style it green when voice models are available, muted otherwise

### 2. Wire VoiceCallMode into Index.tsx
**File: `src/pages/Index.tsx`**
- Import `VoiceCallMode` component
- Add `showVoiceCall` state
- Pass a callback from ChatInput's phone button to trigger `setShowVoiceCall(true)`
- Render `<VoiceCallMode>` when active, passing `onSendMessage={handleVoiceCallMessage}` (already exists), TTS settings, and an `onEnd` callback to close it
- The voice call overlay takes over the full screen (it already does this internally)

### 3. Also wire into other workspaces
**Files: `src/pages/IoTWorkspace.tsx`, `src/pages/SandboxWorkspace.tsx`, `src/pages/ImproveWorkspace.tsx`**
- Same pattern: add VoiceCallMode with the workspace's send handler
- Each workspace already has a `sendChatMessage` flow that can return the response

### 4. Verify all modes load
- No code changes needed — IoT useState bug was already fixed, ErrorBoundary is in place
- All routes should render cleanly

## Technical Details
- `VoiceCallMode` renders as a fixed full-screen overlay (`fixed inset-0 z-50`) when in-call, and just a button when idle
- It uses local Whisper for STT (offline) and browser SpeechSynthesis for TTS
- The component handles its own lifecycle — just needs `onSendMessage` that returns the AI response string
- `handleVoiceCallMessage` in Index.tsx already returns `Promise<string>` via `sendMessageAndGetResponse`

