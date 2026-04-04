

# AI Control Center: Deep Integration Upgrade

## Assessment
The project already has ~80% of the requested systems built. What's missing is deeper integration between them, persistent task storage, autonomous mode, a visual task graph, performance mode selector, tool learning, and export/import. This plan connects existing pieces and adds the missing layers.

## Phase 1: Central Orchestrator + Persistent Task System

**New file: `src/lib/orchestrator.ts`**
- Wraps the existing `task-runner.ts` with persistent storage via IndexedDB (using the existing `db.ts` pattern)
- Task objects gain: `goal`, `steps[]`, `logs[]`, `parentId` (for subtasks), `retryCount`
- Auto-retry failed steps (up to 3 attempts) with backoff
- Pause/resume support via status flags
- Tasks persist across page reloads

**Update: `src/components/TaskQueue.tsx`**
- Show task logs, subtasks, retry indicators
- Add pause/resume buttons
- Expand to show step-by-step execution history

## Phase 2: Autonomous Mode

**New file: `src/lib/autonomous-mode.ts`**
- Toggle that chains agent calls: AI plans steps, executes each via the orchestrator, evaluates results, continues
- Safety: max 20 steps, confirmation for file writes and commands, stop button
- Uses existing `agent-executor.ts` loop but auto-feeds results back as new prompts

**Update: `src/pages/Index.tsx`**
- Add "Autonomous Mode" toggle in header toolbar (next to offline toggle)
- When active, after each AI response, auto-extract next action and re-invoke
- Show step counter and stop button

## Phase 3: Enhanced Multi-Agent System

**Update: `src/lib/agent-router.ts`**
- Agents return structured JSON outputs (wrap responses in `{agent, action, result, nextStep}`)
- Add parallel execution support: router can dispatch to multiple agents and merge results
- Add inter-agent communication: one agent's output feeds as context to the next

**Update: `src/components/AgentActivityPanel.tsx`**
- Show parallel agent tracks
- Progress percentage per agent
- Expand each step to see full details

## Phase 4: Tool Learning System

**New file: `src/lib/tool-learning.ts`**
- Track per-tool: call count, success rate, avg duration, failure reasons
- Store in localStorage (same pattern as `feedback-tracker.ts`)
- Before tool selection, score tools by reliability
- Inject tool reliability hints into agent system prompt
- Expose stats in Debug Panel

## Phase 5: Memory System 2.0

**Update: `src/lib/memory-store.ts`**
- Add memory types: `fact`, `goal`, `pattern`, `preference`
- Add relevance scoring (keyword overlap + recency decay)
- Add memory cleanup: auto-remove memories with zero relevance hits after 30 days
- Automatic extraction: after each conversation, summarize key facts and store

**Update: `src/components/MemoryPanel.tsx`**
- Filter by memory type
- Show relevance scores
- Bulk delete low-value memories

## Phase 6: Visual Task Graph

**New file: `src/components/TaskGraph.tsx`**
- Canvas-based or SVG node graph showing tasks as nodes, dependencies as edges
- Color-coded by status (green=done, blue=running, red=failed, gray=queued)
- Clickable nodes to view task details
- Accessible from sidebar or debug panel

## Phase 7: Performance Modes + Multi-Model Routing

**Update: `src/lib/chat-api.ts`**
- Add performance mode setting: `fast` (gemini-flash-lite), `smart` (gemini-pro / gpt-5), `local` (ollama only)
- Auto-select model based on task complexity (short messages → fast, code/debug → smart)

**Update: `src/components/SettingsDialog.tsx`**
- Add Performance Mode selector (Fast / Smart / Local-Only)

## Phase 8: Safety & Permissions

**New file: `src/lib/permissions.ts`**
- Permission registry: file_write, file_delete, command_exec, system_access
- Safe mode toggle: blocks all destructive operations
- Confirmation dialog for risky actions
- Audit log: all actions with timestamp, user confirmation status

**Update: OpenClaw agent and tool handlers**
- Check permissions before executing tools
- Log all actions to audit trail

## Phase 9: Export / Import System

**New file: `src/lib/export-import.ts`**
- Export: memories, tasks, settings, feedback, tool stats → single JSON file
- Import: validate and merge data
- UI: buttons in Settings page

## Phase 10: Built-in Testing / Validation

**New file: `src/lib/self-test.ts`**
- Run validation suite: test each tool handler, verify memory store, check agent routing
- Show results in Debug Panel
- Auto-run on startup (optional)

---

## Files to Create
- `src/lib/orchestrator.ts` — Central task orchestrator with IndexedDB persistence
- `src/lib/autonomous-mode.ts` — Autonomous execution loop
- `src/lib/tool-learning.ts` — Tool usage tracking and reliability scoring
- `src/lib/permissions.ts` — Permission system and audit log
- `src/lib/export-import.ts` — Data export/import
- `src/lib/self-test.ts` — Built-in validation suite
- `src/components/TaskGraph.tsx` — Visual task dependency graph

## Files to Modify
- `src/lib/task-runner.ts` — Add persistence, subtasks, retry, pause/resume
- `src/lib/agent-router.ts` — Structured outputs, parallel dispatch
- `src/lib/memory-store.ts` — Memory types, relevance scoring, auto-cleanup
- `src/lib/chat-api.ts` — Performance modes, auto-model selection
- `src/pages/Index.tsx` — Autonomous mode toggle, task graph access
- `src/components/TaskQueue.tsx` — Enhanced UI with logs, subtasks
- `src/components/AgentActivityPanel.tsx` — Parallel agents, expanded details
- `src/components/MemoryPanel.tsx` — Type filters, relevance display
- `src/components/SettingsDialog.tsx` — Performance mode, export/import buttons
- `src/components/DebugPanel.tsx` — Tool learning stats, self-test results, audit log
- `src/components/ChatSidebar.tsx` — Task graph link
- `src/lib/openclaw-agent.ts` — Permission checks on tool execution

