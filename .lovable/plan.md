

# Production Upgrade: AI Companion Hub → AI Control Center

## Current State Assessment
The project already has extensive functionality built across 4 rounds of upgrades:
- Multi-mode UI (Chat, IDE, IoT, Sandbox, AI Improvement) — all working
- Cloud backend via Lovable AI Gateway edge functions (chat, run-tool, web-search, plugins, models)
- OpenClaw agent with tool-calling loop (read_file, write_file, search_code, run_command)
- Plugin system with file manager, system monitor, code runner, macros
- Voice call mode with split-screen UI, screen sharing, noise filtering
- Debug panel, code library, task queue, offline/online toggle
- Auto-install start scripts (start.bat, start.sh)

Most of the requested features already exist in some form. This plan focuses on **hardening, connecting, and filling gaps** rather than rebuilding.

---

## Phase 1: Stability & Environment Cleanup

**Files: `package.json`, `start.bat`, `start.sh`**
- Remove `bun.lock` and `bun.lockb` — standardize on `package-lock.json` + Node 20 LTS
- Add `setup.ps1` (PowerShell) that wraps the same logic as `start.bat` for modern Windows users
- Ensure start scripts also check/install Ollama and auto-pull a default model (e.g., `llama3.2`)

## Phase 2: Memory System

**New files: `supabase/functions/memory/index.ts`, `src/lib/memory-store.ts`, `src/components/MemoryPanel.tsx`**
- Create a `memories` database table (id, user_id, content, embedding_text, tags, created_at) with RLS
- Edge function `memory` with endpoints: `store`, `search` (keyword-based semantic search via AI summarization), `list`, `delete`
- "Remember this" button on each assistant message in `ChatMessage.tsx`
- Automatic memory extraction: after each conversation, the AI summarizes key facts and stores them
- Memory viewer panel accessible from settings/sidebar
- Inject relevant memories into system prompt before each chat request

## Phase 3: Multi-Agent System

**New file: `src/lib/agent-router.ts`, update `supabase/functions/chat/index.ts`**
- Create specialized agent personas (Developer, Research, Debug, Automation) as system prompt templates
- Agent router: analyzes user input and selects the best agent(s) based on intent classification
- For complex tasks, split into sub-tasks and route to different agents sequentially
- Show agent activity in UI: add an `AgentActivityPanel` component that displays which agent is working, current step, and progress
- Wire into the existing OpenClaw agentic loop — agents use the same tool-calling infrastructure

## Phase 4: Enhanced Code Execution

**Update: `src/pages/SandboxWorkspace.tsx`, `src/lib/python-runner.ts`**
- Python already runs via Pyodide — verify it works end-to-end
- JavaScript execution: use `Function()` constructor in a sandboxed iframe
- HTML preview: render in an iframe with srcdoc
- For C++/Rust/Go/Java: show "Compile & Run requires local backend" message with instructions to connect to a local compiler service, or provide a cloud compilation option via the run-tool edge function
- Add file output support: download button for generated files

## Phase 5: File System Enhancement

**Update: `src/components/ide/FileTree.tsx`, `src/lib/agent-tools.ts`**
- Already have File System Access API integration — ensure create/delete/rename work
- Add context menu (right-click) on file tree: New File, New Folder, Rename, Delete
- Let AI agents modify files through the existing write_file tool — add confirmation dialog before writes

## Phase 6: UI Polish

**Update: multiple component files**
- Add progress bars with percentages to long-running operations (model downloads, agent loops)
- Agent activity panel: collapsible sidebar showing real-time agent steps with timestamps
- Task timeline: visual step-by-step execution history in the OpenClaw overlay
- Better error notifications: categorize errors (network, auth, model, tool) with specific recovery suggestions
- Ensure all loading states show spinners/skeletons consistently

## Phase 7: Logging & Debug Upgrades

**Update: `src/components/DebugPanel.tsx`, `src/lib/openclaw-store.ts`**
- Add log categories: Errors, AI Requests, Tool Usage, File Operations
- Filter/search logs in the debug panel
- Add "Export Logs" button (downloads JSON)
- Add a debug mode toggle that enables verbose console logging across all modules

## Phase 8: Auto-Build Mode

**New: `src/components/AutoBuildPanel.tsx`, update agent system**
- User describes a project in natural language
- Agent creates a plan (using existing create_plan tool)
- Agent executes plan step-by-step: creates files, writes code, structures project
- Shows progress timeline with each file created
- Uses the existing OpenClaw agentic loop with write_file tool

## Phase 9: Self-Improvement Tracking

**New: `src/lib/feedback-tracker.ts`, update `src/components/ChatMessage.tsx`**
- Add thumbs up/down on AI responses
- Track success/failure rates per agent, per tool
- Store in IndexedDB alongside existing action logs
- Show improvement metrics in the debug panel

---

## Files to Create
- `setup.ps1` — PowerShell setup script
- `supabase/functions/memory/index.ts` — Memory storage/retrieval edge function
- `src/lib/memory-store.ts` — Client-side memory API
- `src/lib/agent-router.ts` — Multi-agent routing logic
- `src/lib/feedback-tracker.ts` — Response quality tracking
- `src/components/MemoryPanel.tsx` — Memory viewer UI
- `src/components/AgentActivityPanel.tsx` — Live agent status UI
- `src/components/AutoBuildPanel.tsx` — Auto-build project wizard

## Files to Modify
- `package.json` — Clean scripts
- `start.bat` / `start.sh` — Add Ollama auto-install and model pull
- `supabase/functions/chat/index.ts` — Memory injection, agent routing
- `src/pages/Index.tsx` — Memory button, agent panel, auto-build access
- `src/components/ChatMessage.tsx` — "Remember" button, feedback thumbs
- `src/components/ChatSidebar.tsx` — Memory panel link
- `src/pages/SandboxWorkspace.tsx` — Enhanced execution for JS/HTML
- `src/components/DebugPanel.tsx` — Log filtering, export, categories
- `src/components/OpenClawOverlay.tsx` — Task timeline visualization
- `src/lib/openclaw-agent.ts` — Agent routing integration

## Files to Delete
- `bun.lock`
- `bun.lockb`

## Database Migration
- Create `memories` table with RLS policies for authenticated users

