

# LocalDev AI → Production-Grade AI Control Center

## Current State
The project is a multi-mode AI development environment with Chat, IDE, IoT, Sandbox, AI Improvement workspaces, plus OpenClaw agent. It has cloud (Lovable AI Gateway), Ollama, llama.cpp, and direct API key backends. There's a known crash bug in IoTWorkspace (line 45: `useState(() => { applyModeTheme(...) })`), and a hardcoded file tree in ImproveWorkspace.

---

## Phase 1: Fix All Crashes & Bugs (CRITICAL)

**1a. Fix IoTWorkspace useState crash**
- `src/pages/IoTWorkspace.tsx` line 45: Replace `useState(() => { applyModeTheme('embedded-iot'); })` with `useEffect(() => { applyModeTheme('embedded-iot'); }, [])`
- This is the same bug that was fixed in SandboxWorkspace

**1b. Audit all workspaces for similar patterns**
- Scan every page/component for `useState` used for side effects
- Verify all modes load without blank screens: Chat (/), IDE (/ide), IoT (/iot), Sandbox (/sandbox), Improve (/improve), Models (/models), Settings (/settings)

**1c. Wrap all async operations with error boundaries**
- Add a global React ErrorBoundary component wrapping routes
- Add try/catch to every `fetch` call that doesn't have one
- Prevent crashes from missing backends (Ollama, llama.cpp, local agent)

---

## Phase 2: Bulletproof Setup Scripts

**2a. Upgrade `setup.bat` / `setup.sh`**
- Add retry logic (3 attempts) for `npm install` / `bun install`
- Add portable Node.js detection and download fallback (nvm-windows / nvm for Linux)
- Remove hard Bun dependency — use it if available, otherwise npm
- Add clear progress output with step numbers and status icons
- Add auto-repair: if `node_modules` exists but is corrupted (missing key packages), delete and reinstall

**2b. Upgrade `start.bat` / `start.sh`**
- Add health checks after starting llama-server and Ollama (retry curl up to 10 times with 1s delay)
- Detect GPU availability and auto-set `-ngl` layers
- Add colored status summary before launching dev server

**2c. Add loading splash page**
- Create `public/loading.html` — a static HTML file shown at startup
- Shows "Installing dependencies..." with a progress bar
- The dev server naturally replaces this once Vite starts

---

## Phase 3: Real Backend Layer (Edge Functions)

Since this is a Lovable Cloud project, we use Edge Functions instead of Express.

**3a. Upgrade existing `chat` edge function**
- Add tool-calling support (function calling via Lovable AI Gateway)
- Add multi-step agent loop: AI can call tools, get results, and continue
- Support both streaming and non-streaming

**3b. Create `run-tool` edge function**
- Accepts tool name + parameters
- Built-in tools: `web_search`, `generate_code`, `analyze_code`, `summarize`
- Returns structured results

**3c. Create `plugins` edge function**
- List registered plugins
- Execute plugin actions
- Store plugin registry in Supabase table

**3d. Create `models` edge function**
- Proxy model status checks for Ollama/llama.cpp when running locally
- Return available cloud models
- Model health status aggregation

**Database migrations needed:**
- `plugins` table (id, name, description, manifest, enabled, created_at)
- `task_queue` table (id, type, status, payload, result, progress, created_at, updated_at)
- `agent_memory` table (id, user_id, key, value, context, created_at)

---

## Phase 4: Turn AI Into an Agent

**4a. Tool calling system**
- Define tool schemas in `src/lib/agent-tools.ts`
- Tools: `read_file`, `write_file`, `search_code`, `run_command`, `web_search`, `create_plan`
- Each tool returns structured output that feeds back into the conversation

**4b. Multi-step execution loop**
- In `src/lib/agent-executor.ts`: send message → check if response contains tool calls → execute tools → feed results back → repeat until done or max iterations (10)
- Show each step in the chat UI with collapsible "thinking" sections

**4c. Agent modes**
- Chat Mode: normal conversation (existing behavior)
- Task Mode: AI breaks down request into steps, executes them sequentially with progress updates
- Tool Mode: user manually selects and triggers tools from a toolbar

**4d. Memory system**
- Short-term: conversation history (already exists)
- Long-term: save key facts to `agent_memory` table via edge function
- AI can query its own memory for context

---

## Phase 5: Real Plugin System

**5a. Plugin architecture**
- `src/lib/plugin-system.ts`: plugin loader, registry, and lifecycle
- Each plugin: `manifest.json` + handler function + optional React component
- Plugins stored in IndexedDB (browser-side) and optionally synced to Supabase

**5b. Three built-in plugins:**
1. **File Manager** — move/rename/copy/extract files using File System Access API
2. **System Monitor** — display CPU cores, memory estimate, WebGPU status, network connectivity, battery level (Navigator API)
3. **Macro Runner** — record and replay sequences of actions (click coordinates, keystrokes, delays)

**5c. Plugin UI in IDE**
- Upgrade existing `PluginManager.tsx` to load plugins dynamically
- Show plugin panels in the right sidebar of IDE
- AI can invoke plugins via tool calling

---

## Phase 6: Model Management System

**6a. Upgrade `/models` page**
- Auto-scan Ollama and llama.cpp on page load (already partially done)
- Add download progress bars using `ReadableStream` for GGUF downloads from HuggingFace
- Show model status: loaded / unloaded / downloading / error
- Add "Set as Default" per-model

**6b. Auto-start and fallback**
- On app load, if selected model is unavailable, try next available model
- Priority: local GGUF → Ollama → Cloud
- Show toast notification when falling back

---

## Phase 7: UI Enhancements

**7a. Real streaming with progress indicators**
- Add token count display during streaming
- Add elapsed time indicator
- Add status badges: "AI thinking...", "Running tool...", "Generating code..."

**7b. Toast notification system upgrade**
- Already using sonner — add persistent toasts for long operations
- Add success/error/warning toasts for all async operations

**7c. DebugPanel → real logs**
- Connect to actual console.log output
- Show network request history
- Show model load/unload events
- Add export logs button

**7d. ChatSidebar → enhanced history**
- Add search/filter for conversations
- Add mode-based grouping tabs
- Show conversation preview snippets

**7e. CodeLibrary → allow execution**
- Add "Run" button to saved snippets (JS/Python only)
- Show output inline

**7f. ImproveWorkspace → dynamic file tree**
- Replace hardcoded `PROJECT_TREE` with actual filesystem scan using File System Access API
- Add "Open Folder" button to select project directory
- Auto-populate tree from opened directory

---

## Phase 8: Automation Engine

**8a. Task queue system**
- `src/lib/task-runner.ts`: queue-based task execution
- Tasks: file processing, script execution, code generation, batch operations
- Store queue in Supabase `task_queue` table

**8b. Background processing UI**
- Task queue panel in sidebar or bottom bar
- Show: task name, status, progress %, estimated time
- Cancel/pause/resume controls

**8c. Macro system**
- Record sequences of user actions
- Replay with configurable delay
- Save macros to IndexedDB

---

## Phase 9: Performance & Reliability

**9a. Global error handling**
- React ErrorBoundary at route level with "Retry" button
- Wrap all `fetch` calls with timeout (10s default) and retry (3 attempts)
- Add `window.onerror` handler for uncaught exceptions

**9b. Retry logic everywhere**
- API calls: exponential backoff (1s, 2s, 4s)
- Model loading: 3 attempts
- File operations: 2 attempts

**9c. Graceful degradation**
- If Ollama is down: show warning, fall back to cloud
- If cloud is down: show offline indicator, offer local-only mode
- If file system API unavailable: disable file operations, show message

---

## Phase 10: "Wow" Features

**10a. Floating overlay widget**
- Mini control panel accessible from any page
- Quick access: send message, run macro, check status
- Draggable, minimizable (OpenClaw overlay already provides this — enhance it)

**10b. Offline mode with local AI**
- Already partially implemented — make it robust
- Cache last-used model info
- Show clear offline indicator in header
- Queue messages when offline, send when reconnected

---

## Implementation Order

Will be executed across multiple implementation rounds:

1. **Round 1**: Phase 1 (crashes) + IoT fix + error boundaries
2. **Round 2**: Phase 3 (edge functions) + Phase 4 (agent) database setup
3. **Round 3**: Phase 4 (agent tools & executor) + Phase 7a-d (UI)
4. **Round 4**: Phase 5 (plugins) + Phase 6 (models)
5. **Round 5**: Phase 2 (setup scripts) + Phase 7e-f (code library & file tree)
6. **Round 6**: Phase 8 (automation) + Phase 9 (reliability)
7. **Round 7**: Phase 10 (wow features) + final polish

## Files to Create
- `src/lib/agent-tools.ts` — tool definitions
- `src/lib/agent-executor.ts` — multi-step execution loop
- `src/lib/plugin-system.ts` — plugin loader
- `src/lib/task-runner.ts` — task queue
- `src/components/ErrorBoundary.tsx` — global error boundary
- `src/components/TaskQueue.tsx` — task queue UI
- `src/components/AgentStatus.tsx` — AI status indicators
- `supabase/functions/run-tool/index.ts` — tool execution
- `supabase/functions/plugins/index.ts` — plugin management
- `supabase/functions/models/index.ts` — model management
- `public/loading.html` — startup splash

## Files to Modify
- `src/pages/IoTWorkspace.tsx` — fix useState crash
- `src/App.tsx` — add ErrorBoundary
- `src/pages/ImproveWorkspace.tsx` — dynamic file tree
- `src/pages/Models.tsx` — download progress, auto-start
- `src/components/DebugPanel.tsx` — real logs
- `src/components/ChatSidebar.tsx` — search, grouping
- `src/components/CodeLibrary.tsx` — run button
- `src/components/OpenClawOverlay.tsx` — enhanced floating widget
- `src/lib/chat-api.ts` — agent tool calling, retry logic
- `supabase/functions/chat/index.ts` — tool calling support
- `setup.bat`, `setup.sh`, `start.bat`, `start.sh` — reliability upgrades

