

## Plan: TTS Speaker Buttons, Sidebar Enhancements, Chat Labeling, All-in-One Routing, and Sidebar Items

This covers 6 areas from the user's requests.

---

### 1. Speaker Button on Every AI Message (TTS everywhere)

**Current state:** `ChatMessage.tsx` already has a speaker button (`Volume2`/`VolumeX`) on every AI message that calls `speak()`/`stopSpeaking()`. TTS auto-play after responses works in `Index.tsx` via `settings.autoPlayTTS`. The workspaces (`IoTWorkspace`, `ImproveWorkspace`, IDE) were updated in the last round to include TTS.

**What's needed:** Verify the speaker button is visible and working. Currently it exists but may be hidden behind `group-hover` opacity. Make it always visible on AI messages so users see it clearly.

**Changes:**
- **`src/components/ChatMessage.tsx`**: Make the speaker button always visible on assistant messages (not hidden behind hover). This ensures it works across all modes since `ChatMessage` is shared everywhere.

---

### 2. Sidebar: Add "My Apps" / Saved Apps Section + File Search

Between "New Chat" and "Models" in the sidebar, add:
- **My Apps** button — shows apps the user has built via App Builder. These are conversations tagged with the `app-builder` mode. Clicking opens that conversation.
- **File Search** button — opens a search dialog that can search conversation content and files.

**Changes:**
- **`src/lib/db.ts`**: Add a `modeKey` field to the `Conversation` interface so chats are tagged with their mode.
- **`src/pages/Index.tsx`**: When saving conversations, include `modeKey` so we know which mode produced it.
- **`src/components/ChatSidebar.tsx`**: 
  - Add "My Apps" button (with `FolderHeart` icon) between New Chat and Models that filters conversations to `app-builder` mode.
  - Add "File Search" button (with `FileSearch` icon) that opens a search across all conversations.
  - Show mode badge/icon next to each conversation in the list so users can see which mode created it.
  - Group conversations by mode label (App Builder, AI Improvement, etc.)

---

### 3. Label Conversations by Mode (AI Improvement, App Builder, etc.)

**Current state:** Conversations are saved with no mode tag. They all look the same in the sidebar.

**Changes:**
- **`src/lib/db.ts`**: Add optional `modeKey?: string` to `Conversation` interface.
- **`src/pages/Index.tsx`**: Pass `currentModeKey` when creating new conversations.
- **`src/components/ChatSidebar.tsx`**: Show a small colored dot or mode icon next to each conversation title. Group or filter by mode.

---

### 4. All-in-One AI: Cross-Mode Routing

The All-in-One mode needs to actually dispatch tasks to other modes. When the user says "send this to sandbox" or "open IDE for this," it should route.

**Changes:**
- **`src/pages/Index.tsx`**: In the All-in-One system prompt, instruct the AI to output special tags like `[ROUTE:sandbox]` or `[ROUTE:ide]`. After receiving a response, parse for these tags and offer a button to navigate.
- **`src/components/ChatMessage.tsx`**: Detect `[ROUTE:xxx]` tags in AI messages and render them as clickable action buttons that navigate to the appropriate workspace.

---

### 5. Sidebar: System Files + PC Search under Models

Add two new sidebar items below Models:
- **System Files** — browse the app's own source files (uses the existing file-system API)
- **PC Search** — search files on the local computer (uses the File System Access API to search within an opened directory)

These make more sense in the sidebar than as plugins since they're core navigation features.

**Changes:**
- **`src/components/ChatSidebar.tsx`**: Add "System Files" and "PC Search" buttons below Models. System Files opens a dialog/panel showing the project's file tree. PC Search triggers the File System Access API to pick a directory and search within it.

---

### 6. Conversation Persistence Across Workspaces

Currently when navigating to `/ide`, `/iot`, `/sandbox`, `/improve`, the chat history from those workspaces is not saved to the main conversation list.

**Changes:**
- **Workspace pages** (`IoTWorkspace.tsx`, `SandboxWorkspace.tsx`, `ImproveWorkspace.tsx`): Use the same `db.ts` functions (`saveConversation`, `getAllConversations`) to persist workspace chats. Tag them with the appropriate `modeKey`.
- These will then appear in the sidebar labeled with their mode.

---

### File Summary

| File | Action |
|------|--------|
| `src/lib/db.ts` | Add `modeKey` field to `Conversation` interface |
| `src/components/ChatMessage.tsx` | Make speaker button always visible on AI messages; add route-action button parsing |
| `src/components/ChatSidebar.tsx` | Add My Apps, File Search, System Files, PC Search buttons; show mode icons on conversations |
| `src/pages/Index.tsx` | Tag conversations with `modeKey`; All-in-One route parsing |
| `src/pages/IoTWorkspace.tsx` | Persist chats to IndexedDB with `modeKey: 'embedded-iot'` |
| `src/pages/SandboxWorkspace.tsx` | Persist chats to IndexedDB with `modeKey: 'sandbox'` |
| `src/pages/ImproveWorkspace.tsx` | Persist chats to IndexedDB with `modeKey: 'ai-improvement'` |

