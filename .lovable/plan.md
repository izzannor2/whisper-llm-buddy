## Goal

Two things, both inside the IDE workspace (`/ide`):

1. **Show real hardware usage (CPU, RAM, Disk) inside the IDE itself**, not just as small badges in the top bar.
2. **Make the App Builder actually build like Lovable does** — a real multi-agent pipeline running through the local agent backend, producing complete, runnable projects (so what you download from GitHub matches what the IDE shows).

---

## 1. Hardware Metrics Panel inside the IDE

Right now the IDE only shows tiny `compact` status badges in the header. We'll add a dedicated panel.

**Backend (`server/index.cjs`)**
- Extend `hardwareSnapshot()` to also return disk usage for the project drive:
  - On Windows: `wmic logicaldisk where "DeviceID='X:'" get FreeSpace,Size /value`
  - On macOS/Linux: `df -kP <PROJECT_ROOT>`
- Result fields: `diskTotalBytes`, `diskFreeBytes`, `diskUsedBytes`, `diskPercent`, `diskMount`.
- Existing `/scan/hardware` and `/scan/hardware/live` (SSE) endpoints automatically include the new fields.

**Frontend**
- New component `src/components/ide/HardwareMetricsPanel.tsx`:
  - Subscribes to the SSE stream `http://127.0.0.1:3847/scan/hardware/live` (with polling fallback).
  - Shows live cards/bars for **CPU %** (with model + cores), **RAM %** (used/total in GB), **Disk %** (used/total in GB, mount path), **GPU** (name + VRAM if detected), plus uptime and load average.
  - Uses existing `Progress` and `Badge` UI primitives. Color codes thresholds (green/amber/red).
- Wire into `src/pages/IDE.tsx`:
  - Add a **"System"** tab to the right-panel `Tabs` (alongside `preview / terminal / commands / plugins / debug`).
  - When the agent is offline, the panel shows a "Start the local agent (port 3847)" prompt with a button calling existing `downloadAgentScript()`.
- Keep the existing compact `<SystemStatusBar />` in the header — the new panel is the detailed view.

---

## 2. Real multi-agent App Builder pipeline

Today the IDE chat sends a single prompt and parses code blocks. To match Lovable's behaviour we'll add a real pipeline that runs on the backend agent and stays consistent with what gets written to disk.

**New module `src/lib/build-pipeline.ts`** — orchestrates four agents in sequence with feedback loops:

```text
User goal
   ↓
[1] Planner   → produces requirements + tech-stack decisions
   ↓
[2] Architect → produces full file tree + per-file responsibilities
   ↓
[3] Coder     → emits complete files using ```lang:/path/to/file.ext fences
   ↓                       (loop per batch of files until tree is covered)
[4] Reviewer  → reads written files, lists missing imports / broken refs,
                emits patch files; loops back to Coder up to N times
   ↓
Done — full project on disk + in IDE
```

- Each agent is a call to `sendChatMessage` with its own system prompt (`PLANNER_PROMPT`, `ARCHITECT_PROMPT`, `CODER_PROMPT`, `REVIEWER_PROMPT`).
- Reuses existing `parseCodeBlocks` + `applyCodeBlocks` for in-IDE state and existing `writeFile()` (via `src/lib/file-system.ts`, which already routes through the local agent's `/file` endpoint) so on-disk files match the IDE tree.
- Streams progress events (`{phase, step, total, message, filesWritten}`) to the UI.
- Honours abort via `AbortController` and the existing kill switch.
- Falls back to cloud (Lovable AI Gateway) if no local model is detected, using existing `chat-api.ts` routing.

**Backend support (`server/index.cjs`)**
- Add `POST /build/run` (auth-gated by `requireSession`): accepts `{goal, projectRoot}`, runs the same pipeline server-side using the same model routing, writes files directly with `fs`, and returns SSE progress. This is what makes the GitHub download match: the backend itself produces the canonical files (frontend stays in sync via existing file watcher).
- Add `GET /build/status` returning `{phase, step, filesWritten, lastError}` for reconnects.

**Frontend wiring**
- New panel `src/components/ide/BuildPipelinePanel.tsx`:
  - Goal textarea + "Start Build" / "Stop" buttons.
  - Live timeline of the four phases with per-step file counts and elapsed time.
  - Auto-opens the latest written file in the editor and refreshes the preview via existing `generatePreview`.
- Replace the current `AutoBuildPanel`'s linear 6-step prompt loop with a call into `runBuildPipeline()` so both the dialog and the IDE use the same engine.
- Add a **"Build"** tab next to System/Preview in the IDE right panel.

**Project completeness (so GitHub matches)**
- Architect prompt is required to always emit: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `README.md`. Reviewer enforces this.
- Existing `downloadProjectAsZip` already serializes the in-memory tree, so once files are present they ship in the zip / GitHub export.

---

## Files

**New**
- `src/components/ide/HardwareMetricsPanel.tsx`
- `src/components/ide/BuildPipelinePanel.tsx`
- `src/lib/build-pipeline.ts`

**Edited**
- `server/index.cjs` — add disk metrics to `hardwareSnapshot`, add `/build/run` + `/build/status` SSE.
- `src/pages/IDE.tsx` — add `system` and `build` tabs to the right panel and mount the new components.
- `src/components/AutoBuildPanel.tsx` — delegate to `runBuildPipeline` from `build-pipeline.ts`.
- `src/lib/code-parser.ts` — export the new agent prompts (planner/architect/coder/reviewer) alongside the existing ones.

No DB or auth changes. No new secrets required (uses existing local agent + Lovable AI Gateway fallback).

---

## Acceptance

- Open `/ide` → right panel has a **System** tab showing live CPU %, RAM used/total, Disk used/total, GPU.
- Open the **Build** tab, type a goal, click Start → pipeline runs through Planner → Architect → Coder → Reviewer; files appear in the file tree and on disk; preview updates; "Download Zip" produces a project that runs the same as what's shown.
- With the local agent offline, the System tab tells you to start it and the Build tab still works against the cloud model (writes go to in-memory IDE tree only, with a clear notice).
