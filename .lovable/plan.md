

# Redesign Voice Call: ChatGPT/Grok-Style with Mini Mode

## What You Want
1. Voice call UI that feels like ChatGPT or Grok — centered animated orb, clean minimal look
2. Controls for: mute, hang up, speaker off, screen share, text input toggle
3. Ability to "minimize" the call into a small floating window so you can go back to texting while staying on the call

## Current State
The voice call is a full-screen takeover with a 60/40 split (chat left, controls right). It has all the features (mute, hang up, speaker off, screen share, text input, PTT) but:
- Can't minimize it — it blocks the entire screen
- Doesn't look like ChatGPT/Grok's clean centered orb design
- Too many controls visible at once

## New Design

```text
┌─────────────────────────────────────────┐
│  FULL-SCREEN CALL (default)             │
│                                         │
│         ● Status: Listening             │
│                                         │
│          ╭─────────────╮                │
│          │   Animated   │                │
│          │     Orb      │                │
│          ╰─────────────╯                │
│                                         │
│       "Listening..." / transcript       │
│                                         │
│    ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐ │
│    │ Mute│  │Hang │  │Spkr │  │Mini │ │
│    │     │  │ Up  │  │ Off │  │  ▼  │ │
│    └─────┘  └─────┘  └─────┘  └─────┘ │
│         [Screen Share] [Text] [PTT]     │
└─────────────────────────────────────────┘

When minimized → small floating pill at bottom-right:

┌──────────────────────────────────┐
│  Normal chat view visible        │
│                                  │
│                   ┌────────────┐ │
│                   │ 🟢 00:42  │ │
│                   │ [🔇][📞]  │ │
│                   │   [▲]     │ │
│                   └────────────┘ │
└──────────────────────────────────┘
```

## Implementation

### Redesign full-screen view (ChatGPT-style)
- Remove the 60/40 split layout — go to a single centered column
- Large animated orb in the center (pulsing rings based on state: green=listening, purple=speaking, yellow=processing)
- Transcript text below the orb
- Bottom control bar: row of circular buttons — Mute, Hang Up, Speaker Off
- Secondary row below: Screen Share, Text Input toggle, PTT toggle, **Minimize** button (chevron-down icon)
- Chat history moves to a scrollable overlay behind the orb (subtle, transparent background) — or hidden entirely in full mode, only visible in mini mode's parent chat

### Add minimize/expand toggle
- New state `isMinimized` — when true, render a small floating pill instead of full-screen
- **Mini pill**: fixed bottom-right corner, shows call timer, status dot, mute button, hang-up button, and expand button
- Call continues running in the background — audio recording/playback uninterrupted
- When minimized, the normal chat UI is fully accessible underneath
- Click expand (chevron-up) to go back to full-screen

### Call timer
- Track `callStartTime` on call start
- Display elapsed time in `MM:SS` format in both full and mini views

### Files to Modify
- `src/components/VoiceCallMode.tsx` — Full redesign of the render section (lines 560-837). Core logic (start/stop/listen/transcribe) stays unchanged. Changes:
  - Add `isMinimized` state and `callStartTime` state
  - New full-screen layout: centered column with orb, transcript, and two rows of controls
  - New mini-mode render: small floating card with status, timer, mute, hang-up, expand
  - Minimize button in full view, expand button in mini view
  - Move chat history display to only show in mini-mode's parent (the Index page chat still has it via `existingMessages`)

- `src/pages/Index.tsx` — Minor: ensure `showVoiceCall` doesn't hide the main chat when call is minimized. Currently `showVoiceCall` renders `<VoiceCallMode>` which takes over the whole screen. Add a prop or callback so the minimized state allows the chat to show through.

## What Stays the Same
- All voice logic (Whisper STT, TTS, silence detection, push-to-talk)
- Screen sharing capture logic
- Text input during call
- All keyboard shortcuts (Space, Esc)

