

## Plan: Unique Mode Experiences + Planning Feature + Script Updates

### What You're Asking For

Each mode needs its own **layout and behavior**, not just a color swap. Plus a "Plan first" workflow for App Builder and AI Improvement, and updated setup/start scripts.

---

### Mode-by-Mode Design

**1. App Builder** (navigates to `/ide`)
- Add a **Planning Phase**: Before entering the IDE, show a planning chat where you describe what you want built. A "Start Building" button transitions to the full IDE with the plan context carried over.
- The IDE layout stays as-is (file tree + editor + preview).

**2. IoT / Embedded** (new route `/iot`)
- **Arduino IDE-inspired layout**: Dark green/teal header bar, single editor pane with board selector dropdown at top, serial monitor panel at bottom, "Verify" and "Upload" buttons in the toolbar.
- File tabs styled like Arduino sketches. Board selector prominent in header.
- Chat panel on the left (collapsible).

**3. System Helper** (stays on `/` but with unique UI)
- Terminal-centric layout: Chat renders commands in a terminal-style format. Output panel below chat shows command queue with approve/reject/run buttons.
- Amber monospace styling throughout.

**4. AI Improvement** (new route `/improve`)
- **Planning phase** like App Builder — describe what to improve first.
- Split layout: Left = chat, Right = file browser of the app's own source code with a "Preview Changes" diff view.
- Pink/magenta theme. Shows the app's file tree and lets AI suggest diffs.

**5. Learning Mode** (stays on `/`)
- Card-based UI showing learned patterns (preferences, conventions, libraries).
- Chat with a "Patterns Learned" sidebar panel showing what it's picked up.
- Green theme with a dashboard feel.

**6. Sandbox** (new route `/sandbox`)
- Playground layout: Code editor on left, live output/console on right.
- Pyodide integration for instant Python execution, plus JS eval.
- Cyan theme with "experimental" warning banner. No file persistence.

**7. Uncensored/Jailbreak** (stays on `/`)
- Dark red theme with danger styling. Custom system prompt editor inline at the top.
- Warning banner always visible. Otherwise standard chat.

**8. Plugin Mode** (stays on `/`)
- Plugin marketplace-style grid showing installed plugins with toggle switches.
- Chat below for creating/configuring plugins.
- Blue theme.

**9. Chat** (stays on `/`)
- Default teal. No changes needed — this is the baseline.

---

### New Routes

| Route | Mode |
|-------|------|
| `/` | Chat, System Helper, Learning, Uncensored, Plugin (all chat-based with unique UI tweaks) |
| `/ide` | App Builder |
| `/iot` | IoT / Embedded (Arduino IDE layout) |
| `/sandbox` | Sandbox (playground) |
| `/improve` | AI Improvement (self-modification workspace) |

---

### Planning Feature (App Builder + AI Improvement)

Both modes get a **two-phase workflow**:
1. **Plan Phase**: A focused chat screen where you describe what you want. The AI responds with a structured plan (steps, files to create/modify, architecture).
2. **Build Phase**: Click "Start Building" → navigates to the full workspace with the plan loaded as context.

Implementation: A `PlanningView` component shared by both modes, with mode-specific prompts and styling.

---

### Files to Create/Modify

**New files (5):**
- `src/pages/IoTWorkspace.tsx` — Arduino IDE-style layout
- `src/pages/SandboxWorkspace.tsx` — Playground with live execution
- `src/pages/ImproveWorkspace.tsx` — Self-improvement workspace with diff view
- `src/components/PlanningView.tsx` — Shared planning phase component
- `src/components/PatternsSidebar.tsx` — Learning mode patterns panel

**Modified files (7):**
- `src/App.tsx` — Add new routes (`/iot`, `/sandbox`, `/improve`)
- `src/pages/Index.tsx` — Route IoT → `/iot`, AI Improvement → `/improve`, Sandbox → `/sandbox`; add mode-specific UI panels for System Helper, Learning, Uncensored, Plugin when on `/`
- `src/pages/IDE.tsx` — Accept plan context from planning phase
- `src/components/EmptyState.tsx` — Add planning button for app-builder and ai-improvement modes
- `src/lib/mode-themes.ts` — No structural changes needed
- `setup.bat` — Fix and update for reliability
- `start.bat` — Fix and update for reliability

---

### Script Updates (setup.bat + start.bat)

- Ensure `setup.bat` checks for Bun as alternative to npm
- `start.bat` should handle the case where port 8080 is already in use
- Add error handling for missing `curl` on older Windows
- Both scripts already exist and are functional — just need robustness fixes and ensuring `npm run dev` launches correctly with the Vite config

---

### Technical Notes

- Mode routing uses the existing `handleModeChange` pattern — just adding more `navigate()` calls
- Each workspace page imports its own subset of components (no bloated single page)
- Planning state is passed via React Router `state` or a lightweight store
- The IoT workspace reuses `CodeEditor` (Monaco) but with Arduino-style chrome around it
- Sandbox uses existing Pyodide integration from `src/lib/python-runner.ts`
- AI Improvement workspace reads the project's own file tree to show what can be modified

