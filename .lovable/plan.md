

## Plan: Full Mode Audit, Planning Buttons, OpenClaw Integration, Models Page Overhaul, and Script Fixes

This is a large scope covering 5 major areas. Here's what needs to happen:

---

### 1. Planning Button in ChatInput for App Builder & AI Improvement

Currently, the `PlanningView` component exists but is only reachable via `EmptyState` workspace buttons. The user wants a **Plan button right next to the Send button** so they can toggle between "planning" and "building/improving" from within the chat.

**Changes:**
- **`src/components/ChatInput.tsx`**: Add a "Plan" toggle button (e.g., a `Lightbulb` or `ListTodo` icon) next to the Send button, visible only when `modeKey` is `app-builder` or `ai-improvement`. When active, it prefixes the system prompt with planning instructions before sending.
- **`src/pages/Index.tsx`**: Accept a `planningMode` state. When planning is active, prepend the planning-phase system prompt (architecture steps, file list, etc.) to messages. Show a visual indicator that planning mode is on.

---

### 2. All 9 Modes — Ensure Each Works with Unique Style

Current issues found:
- **Chat**: Works. Teal theme. No issues.
- **App Builder**: Navigates to `/ide`. Works but the IDE uses `streamChat` from `ollama-client` directly instead of `sendChatMessage` from `chat-api.ts`, meaning it won't work with Cloud backend. **Fix needed.**
- **IoT/Embedded**: Navigates to `/iot`. Same `streamChat` issue — only works with Ollama. Arduino-style theme is good. **Fix chat to use `sendChatMessage`.**
- **System Helper**: Stays on `/`. Theme works. System commands parsing works in IDE but NOT on the main chat page. **Add command parsing to Index.tsx for this mode.**
- **AI Improvement**: Navigates to `/improve`. Chat works via `sendChatMessage`. Theme is good. File tree is hardcoded/static. OK for now.
- **Learning Mode**: Stays on `/`. Theme works. `PatternsSidebar` exists but is never rendered on Index. **Wire up PatternsSidebar.**
- **Sandbox**: Navigates to `/sandbox`. Code execution works (Python via Pyodide, JS via eval). Theme is good. Uses a `<textarea>` instead of Monaco editor. **Upgrade to Monaco for consistency.**
- **Uncensored/Jailbreak**: Stays on `/`. Red theme works. Uses jailbreak prompt from settings. Works.
- **Plugin Mode**: Stays on `/`. Blue theme works. No actual plugin management on the main page — it's only in the IDE. **Add a plugin list/grid to EmptyState or a sidebar panel.**

**Changes:**
- **`src/pages/IoTWorkspace.tsx`**: Replace `streamChat` with `sendChatMessage` from `chat-api.ts` so it works with Cloud and all backends.
- **`src/pages/IDE.tsx`**: Same — replace `streamChat` with `sendChatMessage` so App Builder works regardless of backend.
- **`src/pages/Index.tsx`**: For System Helper mode, parse AI responses for commands and show them. For Learning mode, render `PatternsSidebar` in the sidebar area.
- **`src/pages/SandboxWorkspace.tsx`**: Replace `<textarea>` with Monaco `CodeEditor` component.
- **`src/components/EmptyState.tsx`**: For Plugin mode, show a basic plugin card grid. For Learning mode, mention patterns sidebar.

---

### 3. OpenClaw Agent — Make It Actually Work with Everything

Currently OpenClaw:
- Requires Ollama (hardcoded `streamChat` from `ollama-client`)
- The `chat` function in `openclaw-agent.ts` only uses Ollama's streaming
- Won't work if user is on Cloud backend

**Changes:**
- **`src/lib/openclaw-agent.ts`**: Replace `streamChat` from `ollama-client` with `sendChatMessage` from `chat-api.ts` (with streaming). This lets OpenClaw use whatever backend the user has configured (Cloud, Ollama, llama.cpp, API keys).
- **`src/lib/openclaw-agent.ts`**: Update `initOpenClaw` to not require Ollama — check if any backend is available (Cloud is always available).
- **`src/hooks/use-openclaw.ts`**: No changes needed if the agent is fixed.
- **`src/components/OpenClawOverlay.tsx`**: Update the "Ollama not detected" message to be backend-agnostic.

---

### 4. Models Page — Real Hugging Face Integration

The Models page (`src/pages/Models.tsx`) is entirely mock data. The "Explore Models" button does nothing. No actual download capability.

**Changes:**
- **`src/pages/Models.tsx`**: 
  - Add a "Browse Hugging Face" tab that fetches from the HF API (`https://huggingface.co/api/models?filter=gguf&sort=downloads&limit=20`)
  - Show model cards with name, size, download count, and a "Download" button
  - Download button fetches the GGUF file and stores it in IndexedDB (since we can't write to filesystem from browser) or triggers a browser download to `models/gguf/`
  - "Scan Local Models" button actually calls `ollama list` via the local agent or checks `localhost:11434/api/tags` and `localhost:8081/v1/models`
  - Remove mock `MOCK_MODELS` data and replace with real detection from Ollama/llama.cpp endpoints
  - Add Ollama pull integration: input a model name, call `POST localhost:11434/api/pull` to download directly

---

### 5. Scripts — setup.bat/start.bat

The scripts look functional already. Minor fixes:
- **`setup.bat`**: Add a check for `curl` availability (some old Windows). Already handles bun/npm.
- **`start.bat`**: Already handles port 8080 conflict detection, llama-server auto-start, Ollama start. Looks solid. Minor: add `setup.sh`/`start.sh` parity checks.
- Both scripts reference correct paths and behaviors. No major issues found.

---

### File Summary

| File | Action |
|------|--------|
| `src/components/ChatInput.tsx` | Add Plan toggle button for app-builder/ai-improvement modes |
| `src/pages/Index.tsx` | Planning mode state, system-helper command parsing, learning sidebar |
| `src/pages/IDE.tsx` | Replace `streamChat` with `sendChatMessage` |
| `src/pages/IoTWorkspace.tsx` | Replace `streamChat` with `sendChatMessage` |
| `src/pages/SandboxWorkspace.tsx` | Upgrade textarea to Monaco editor |
| `src/pages/Models.tsx` | Real HF API integration, Ollama scanning, model download |
| `src/lib/openclaw-agent.ts` | Use `sendChatMessage` instead of Ollama-only `streamChat` |
| `src/components/OpenClawOverlay.tsx` | Fix status messages to be backend-agnostic |
| `src/components/EmptyState.tsx` | Plugin grid for plugin mode |
| `src/pages/ImproveWorkspace.tsx` | Add plan button in input area |

