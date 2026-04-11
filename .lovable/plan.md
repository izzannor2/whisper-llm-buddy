

# Fix Voice Call Button — Show Full Call UI Immediately

## Problem
When the phone button is clicked in the main chat, `VoiceCallMode` renders with `autoStart` but:
1. Component starts with `isInCall = false` → renders only a tiny phone icon button
2. `startCall()` calls `getUserMedia` for mic permission check
3. If mic permission fails (common in iframe/preview), the function returns early without setting `isInCall = true`
4. The full-screen call UI (mute, hang up, speaker off, minimize) never appears
5. User only sees a toast saying "Speak anytime" and a small button

## Fix

### File: `src/components/VoiceCallMode.tsx`

**1. Show full-screen UI immediately when `autoStart` is true**
- Change the idle check: when `autoStart` is passed, skip rendering the small phone button and show the full-screen call UI right away
- Set `isInCall = true` at the start of `startCall()` BEFORE the mic permission check
- If mic permission fails, stay in the full-screen UI with a "Mic unavailable" state instead of silently reverting

**2. Make `startCall` resilient to mic failure**
- Move `isCallActiveRef.current = true` and `setIsInCall(true)` to happen BEFORE the `getUserMedia` check
- If mic fails, show an error state within the full-screen UI (e.g., muted state with retry option) instead of returning early
- The hang up button will still work to dismiss the call

**3. Auto-show on mount with autoStart**
- In the `autoStart` useEffect, immediately set `isInCall(true)` so the UI renders, then call `startCall()` for mic/STT setup

### Result
- Click phone → full-screen overlay appears instantly with mute, hang up, speaker controls
- If mic access fails, user sees the call UI with a "Mic unavailable — tap to retry" message
- Hang up always works to dismiss
- No change to the existing call flow when mic works correctly

## File Changes
| File | Change |
|------|--------|
| `src/components/VoiceCallMode.tsx` | Show full UI immediately on autoStart; make startCall resilient to mic failure |

