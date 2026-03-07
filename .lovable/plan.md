

## Plan: Complete Mode Overhaul + 10th "All-in-One AI" Mode + TTS/STT Everywhere + Online/Lock Buttons + Script Fixes

This is a large plan covering 7 areas. Here's what needs to happen:

---

### 1. TTS and STT Working Through All Modes

**Current state:** TTS/STT works on the main chat page (`Index.tsx`) but is missing from the dedicated workspace pages — IoT (`/iot`), Sandbox (`/sandbox`), and Improve (`/improve`) have no microphone input or TTS auto-play.

**Fix:**
- **`IoTWorkspace.tsx`**: Add microphone recording (reuse Whisper logic from `ChatInput`), add TTS auto-play after AI responses using `speak()` from `tts.ts`
- **`SandboxWorkspace.tsx`**: No chat currently — add a collapsible chat panel with voice input support
- **`ImproveWorkspace.tsx`**: Already has chat — add Whisper mic button to the input area and TTS auto-play
- **`IDE.tsx`**: The `IDEChat` component needs TTS auto-play wired up (currently uses `speakAIResponse` from `tts-engine.ts` which is a different module than `tts.ts` — unify or ensure both work)

---

### 2. Planning Button Goes Where It Needs To

**Current state:** Planning toggle exists in `ChatInput.tsx` for `app-builder` and `ai-improvement` modes, but those modes immediately navigate to `/ide` and `/improve` respectively — so the planning button on the main chat page is never seen.

**Fix:**
- **`ImproveWorkspace.tsx`**: Already has a plan toggle button — verify it works and sends planning-prefixed prompts
- **`IDE.tsx`**: Add a planning toggle to `IDEChat` input area so App Builder mode can plan before building
- **`Index.tsx`**: Remove the route-away for `app-builder` and `ai-improvement` from `handleModeChange` — instead, stay on `/` for chatting/planning and only navigate to the workspace via the EmptyState "Open Workspace" button. This way the planning button in ChatInput is actually usable.

Alternative: Keep auto-navigation but add planning toggle to the workspace pages' chat panels too. I'll do this approach since the user wants workspaces to stay distinct.

---

### 3. All Nine Modes Look Like Different Products

**Current state:** All modes just swap CSS accent colors. The layout is identical — same chat container, same sidebar, same input box.

**Fix — give each mode a visually distinct layout on the main page (`/`):**

| Mode | Visual Differentiation |
|------|----------------------|
| **Chat** | Current default — clean, minimal teal |
| **App Builder** | Auto-navigates to `/ide` (purple IDE layout — already distinct) |
| **IoT** | Auto-navigates to `/iot` (Arduino-style — already distinct) |
| **System Helper** | Terminal-style: monospace font throughout, amber scanline effect, command output blocks with approve/reject buttons |
| **AI Improvement** | Auto-navigates to `/improve` (split pane — already distinct) |
| **Learning** | Dashboard cards layout: show "Patterns Learned" cards above chat, green botanical/organic styling |
| **Sandbox** | Auto-navigates to `/sandbox` (playground — already distinct) |
| **Uncensored** | Dark red theme with danger borders, glitch-style header text, pulsing warning banner, custom prompt editor visible at top |
| **Plugin** | Grid layout showing plugin cards above chat area, blue tech/circuit styling |

**Implementation in `Index.tsx`:** Wrap the chat area in a mode-specific layout component. Add CSS classes per mode that change:
- Font family (monospace for System Helper, sans-serif for others)
- Background patterns (subtle grid for Plugin, scanlines for System Helper, organic curves for Learning)
- Border styles (dashed red for Uncensored, solid for others)
- Additional UI panels above or beside the chat (patterns sidebar for Learning, command queue for System Helper, plugin grid for Plugin)

**Implementation in `EmptyState.tsx`:** Each mode gets a completely different empty state layout — not just different text but different component structure:
- System Helper: fake terminal prompt UI
- Learning: dashboard with pattern cards
- Plugin: marketplace grid
- Uncensored: big warning with custom prompt editor

---

### 4. Online Button and Lock Button in Sidebar

**Current state:** The Online/Offline button just shows network status text. The Lock button does nothing.

**Fix:**
- **Online button**: Toggle between online and offline mode. When clicked, toggle `settings.offlineMode` in `chat-api.ts` settings. When offline, show "Offline" with `WifiOff` icon and disable cloud backend. When online, show "Online" with `Wifi` icon.
- **Lock button**: Screen lock feature. When clicked, show a full-screen overlay requiring a PIN or click to unlock. Store lock state in `sessionStorage`. Show a `Lock`/`Unlock` icon. Good for privacy — prevents others from reading your chat.

**Files:** `ChatSidebar.tsx`, new `LockScreen.tsx` component, `Index.tsx` (add lock state)

---

### 5. 10th Mode: "All-in-One AI" with Kill Switch

**New mode** that combines all capabilities — file access, web search, system commands, code generation — into one omnipotent mode.

**Implementation:**
- Add `all-in-one` entry to `MODE_THEMES` (gradient rainbow/gold theme)
- Add to `MODES_LIST` in `ChatSidebar.tsx`
- System prompt instructs the AI it can do anything: file operations, web searches, system commands, code generation, IoT, etc.
- **Kill switch**: A prominent red button in the mode's UI. When pressed, it:
  - Cancels any in-flight requests (`abortRef.current?.abort()`)
  - Stops TTS (`stopSpeaking()`)
  - Stops any running OpenClaw tasks
  - Clears the streaming content
  - Shows a "KILLED" banner
  - Optionally reverts to Chat mode
- The kill switch also appears as a floating button when this mode is active
- Route: stays on `/` with a unique all-powerful layout — split between chat and a live activity log showing what the AI is doing

**Files:** `mode-themes.ts` (add entry), `ChatSidebar.tsx` (add to list), `Index.tsx` (add kill switch logic and all-in-one layout), `EmptyState.tsx` (add all-in-one empty state)

---

### 6. Script Fixes (setup.bat, start.bat)

**Current state:** Scripts look functional. Minor issues:
- `setup.bat` uses `%GGUF_COUNT%` inside an `if` block which won't work due to delayed expansion
- `start.bat` references `run.bat` nowhere — user mentioned `run.bat` but the file is `start.bat`

**Fix:**
- Add `setlocal EnableDelayedExpansion` to both scripts
- Create `run.bat` as a simple alias that calls `start.bat`
- Ensure both scripts handle spaces in paths
- Add `setup.sh` and `start.sh` equivalent fixes (already exist)

---

### 7. File Summary

| File | Action |
|------|--------|
| `src/lib/mode-themes.ts` | Add `all-in-one` mode theme (rainbow/gold), update mode entries |
| `src/components/ChatSidebar.tsx` | Add All-in-One mode, fix Online toggle, fix Lock button |
| `src/pages/Index.tsx` | Mode-specific layouts (System Helper terminal, Learning dashboard, Plugin grid, Uncensored danger zone, All-in-One with kill switch), lock screen, online toggle |
| `src/components/EmptyState.tsx` | Unique empty state layouts per mode |
| `src/pages/IoTWorkspace.tsx` | Add Whisper mic + TTS auto-play |
| `src/pages/ImproveWorkspace.tsx` | Verify plan button works, add TTS auto-play |
| `src/pages/IDE.tsx` | Add planning toggle to IDEChat area |
| `src/components/LockScreen.tsx` | New — full-screen lock overlay |
| `run.bat` | New — alias for start.bat |
| `setup.bat` | Fix delayed expansion |
| `start.bat` | Fix delayed expansion |

