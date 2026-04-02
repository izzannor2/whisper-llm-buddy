

# Round 2: Multi-Feature Upgrade

This covers all requests: testing modes, AI Improvement UX upgrades, consolidating scripts, OpenClaw agent improvements, live preview, and remote access settings.

---

## 1. Fix & Verify All Modes Load

All pages already use `useEffect` for theme application (IoT was fixed). No remaining `useState` side-effect bugs. The ErrorBoundary is already wrapping routes. All modes should load cleanly.

---

## 2. AI Improvement Mode — Select All & File Upload

**File: `src/pages/ImproveWorkspace.tsx`**

- Add a **"Select All / Deselect All"** toggle button at the top of the file tree panel header (next to "Project Source")
- Add per-directory "Select All" — clicking a directory checkbox selects/deselects all children recursively
- Add an **"Open Folder"** button that uses the File System Access API (`window.showDirectoryPicker()`) to let users browse their actual source code folder
  - On folder selection, recursively scan the directory and build a dynamic `FileNode[]` tree replacing the hardcoded `PROJECT_TREE`
  - Read file contents on demand when the AI needs context
- Add an **"Upload Files"** button as fallback (for browsers without File System Access API) using `<input type="file" webkitdirectory>` to upload a whole folder

---

## 3. Consolidate Setup Scripts → Single `start.bat` / `start.sh`

- Merge `setup.bat` into `start.bat` — the start script already checks for `node_modules` and installs if missing. Enhance it to include ALL setup logic (retry, auto-repair, health checks) so `setup.bat` is no longer needed
- Remove `run.bat` (it's just an alias for `start.bat`)
- Same for `start.sh` — make it self-contained with full setup logic
- Remove `setup.sh` as a separate file
- Keep the scripts robust with retry logic, colored output, auto-detect GPU, etc.

---

## 4. OpenClaw — Real AI Assistant

**File: `src/lib/openclaw-agent.ts`**

- Upgrade `chatWithOpenClaw` to parse AI responses for tool-call markers (e.g., `[TOOL:read_file path="..."]`) and execute them automatically
- Add an agentic loop: after tool execution, feed results back to the AI and continue until it produces a final answer (max 10 iterations)
- Integrate with the existing `agent-tools.ts` and `agent-executor.ts` created in Round 1

**File: `src/components/OpenClawOverlay.tsx`**

- Show tool execution steps in the chat (collapsible "Thinking..." sections)
- Add status indicator: "Idle", "Thinking", "Executing tool...", "Writing file..."
- Make OpenClaw capable of: reading/writing files, running commands, searching code, and applying fixes — all through the chat interface

---

## 5. AI Improvement — Live Preview Panel

**File: `src/pages/ImproveWorkspace.tsx`**

- Replace the static file tree right panel with a **split view**: file tree on top, live preview iframe on bottom
- When a code block is hovered or selected, show a live preview of the changed file in an iframe (for HTML/React) or a syntax-highlighted diff view (for non-visual files)
- Add a "Preview" tab next to the file tree that renders the current state of applied changes
- Use `preview-builder.ts` (already exists) to generate preview HTML from code blocks

---

## 6. Remote Access Settings

**File: `src/pages/IDESettings.tsx`**

Add a new **"Remote Access"** tab/section:

- Show the machine's local IP address (detected via `RTCPeerConnection` trick or WebRTC) with the dev server port (8080)
- Display two connection URLs:
  - **Home (LAN)**: `http://192.168.x.x:8080` — for devices on the same WiFi
  - **Away (External)**: Show instructions to use a tunnel (e.g., `npx localtunnel --port 8080`) or display the external IP if detectable
- Add a "Copy URL" button for each
- Show QR code for the LAN URL (generate using a simple canvas-based QR renderer) so users can scan with their phone
- Add a note: "Make sure your firewall allows port 8080 for LAN access"

---

## Files to Create
- None (all changes are modifications to existing files)

## Files to Modify
- `src/pages/ImproveWorkspace.tsx` — Select All, file upload, live preview panel
- `src/pages/IDESettings.tsx` — Remote Access tab
- `src/lib/openclaw-agent.ts` — Agentic tool-calling loop
- `src/components/OpenClawOverlay.tsx` — Tool execution UI
- `start.bat` — Consolidate setup + run into one script
- `start.sh` — Consolidate setup + run into one script

## Files to Delete
- `setup.bat` — Merged into `start.bat`
- `setup.sh` — Merged into `start.sh`
- `run.bat` — Redundant alias

