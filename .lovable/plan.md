

## Plan: IDE Code Auto-Apply + TTS on All Messages + Mode Verification

Three main deliverables:

---

### 1. Lovable-Style Code Display in IDE (App Builder)

When the AI responds with code blocks, automatically extract them and show them in the editor panel in real-time as the response streams in.

**How it works:**
- **`src/pages/IDE.tsx`**: Parse streaming content and completed responses for fenced code blocks with filenames (e.g., ` ```tsx // src/App.tsx ` or ` ```tsx filename="App.tsx" `). When detected:
  - Create/update `ProjectFile` entries in the project's file tree
  - Auto-open the file in the editor tab
  - Switch the right panel to "Preview" tab
- **Code block detection regex**: Look for patterns like ` ```language\n// filename.ext` or ` ```language filename="..."` at the start of code blocks
- This happens during streaming too — as code blocks complete, they appear in the editor in real-time
- Add an "Apply" indicator on the code editor tab showing which files were AI-generated

**Changes:**
- `src/pages/IDE.tsx`: Add `parseCodeBlocksFromResponse(content)` utility that extracts `{ filename, language, code }[]` from markdown. On each streaming chunk and on final response, call this to update project files and open tabs.

---

### 2. Speaker Button (TTS) on IDEChat Messages

Currently `IDEChat` renders messages with plain `ReactMarkdown` — no speaker button, no per-message TTS. The main chat uses `ChatMessage.tsx` which has speaker buttons.

**Fix:** Replace the inline message rendering in `IDEChat` with the shared `ChatMessage` component, or add a speaker button to each assistant message bubble.

**Simpler approach — add speaker buttons inline:**
- `src/components/ide/IDEChat.tsx`: Import `speak`, `stopSpeaking`, `isTTSSupported` from `@/lib/tts`. Add a `Volume2` button on each assistant message that calls `speak(message.content)`. Track which message is speaking via state.

---

### 3. All 10 Modes Verification & Fixes

Quick audit of what's missing:

| Mode | Issue | Fix |
|------|-------|-----|
| **Chat** | Works | None |
| **App Builder** (`/ide`) | No speaker on messages, no code-to-editor | Items 1 & 2 above |
| **IoT** (`/iot`) | Uses `IDEChat` — same missing speaker | Same fix in IDEChat |
| **System Helper** | Works on `/` | None |
| **AI Improvement** (`/improve`) | Has mic + TTS auto-play, no per-message speaker | Add speaker button to message bubbles |
| **Learning** | Works on `/` | None |
| **Sandbox** (`/sandbox`) | No chat panel at all — just code + output | No change needed (it's a code runner, not a chat) |
| **Uncensored** | Works on `/` | None |
| **Plugin** | Works on `/` | None |
| **All-in-One** | Works on `/` | None |

---

### File Summary

| File | Action |
|------|--------|
| `src/pages/IDE.tsx` | Add code block parser to extract files from AI responses, auto-create project files, auto-open in editor tabs |
| `src/components/ide/IDEChat.tsx` | Add per-message speaker button (Volume2) for TTS on assistant messages |
| `src/pages/ImproveWorkspace.tsx` | Add per-message speaker button to assistant message bubbles |

