

# Mode Validation & Honesty Pass — All Workspaces

Audit and tighten every workspace mode so each behaves honestly and matches its stated purpose. No redesign, no new features beyond what's needed to make existing modes work correctly.

## Scope

10 workspaces to validate: App Builder (IDE), AI Improvement, Embedded/IoT (ESP/Arduino/RPi), System Helper, Learning, Jailbreak, Plugin, Sandbox, plus Chat and All-in-One.

## 1. App Builder (`src/pages/IDE.tsx`)

- Verify streaming preview works for all language code blocks (tsx/ts/jsx/js/css/html/json), not just tsx.
- Confirm `parseCodeBlocks` handles every format the AI emits (already supports 4 patterns — verify in flow).
- Ensure preview rebuilds work when only CSS or only JSON changes (currently keyed off `project.updatedAt`, which is correct).
- Confirm "Stop" during streaming actually aborts and the partial preview stays usable.

## 2. AI Improvement (`src/pages/ImproveWorkspace.tsx`)

- Verify the existing Reset Preview, Refresh, Apply All, and Diff buttons all wire to real state.
- Confirm `previewError` surfaces when build fails (already added).
- Verify voice auto-send still triggers improvement flow.

## 3. Embedded / IoT (`src/pages/IoTWorkspace.tsx`)

This is the highest-risk mode for fakeness — needs the most attention.

- **Build/Flash buttons**: route through `local-backend-agent.executeCommand` using `settings.buildCommand` and `settings.flashCommand`. If agent disconnected → honest toast + "PREVIEW ONLY" output, never fake success.
- **Serial monitor**: only show "Connected" if the agent reports a real serial connection. If no agent → disabled state with tooltip "Requires LocalDev Agent on port 3847".
- **Board picker**: confirm all 9 boards in `BOARD_TYPES` (ESP32, ESP32-S3, ESP8266, Arduino Uno/Nano/Mega, RPi Pico/Zero/4) actually swap the system prompt and language template (cpp for Arduino/ESP, python for RPi).
- **Code generation**: when AI emits cpp/python code, the Apply button writes to project files using the correct extension (.ino for Arduino, .cpp for ESP, .py for RPi).

## 4. System Helper (`src/pages/Index.tsx` System Helper mode)

- Verify all proposed system commands route through `system-commands.executeCommand` (already updated to fail honestly if agent offline).
- Confirm the dangerous-command confirmation gate still requires explicit approval before sending to the agent.

## 5. Learning Mode

- Verify `PatternsSidebar` reads from real `memory-store` learned patterns, not placeholders.
- Confirm naming convention / framework / folder structure settings actually inject into the system prompt.

## 6. Jailbreak Mode

- Verify `settings.jailbreakPrompt` is prepended to system prompt only when `settings.jailbreakEnabled === true`.
- Confirm visible warning banner stays on while active.

## 7. Plugin Mode

- Verify `PluginManager` lists real plugins from `plugin-system.ts` (calculator + any user-added).
- Confirm plugin command execution routes through real handler, not stub.

## 8. Sandbox Mode (`src/pages/SandboxWorkspace.tsx`)

- Verify Pyodide path runs real Python (already real via `python-runner.ts`).
- Verify other-language execution either runs through WebContainers/agent OR shows honest "language not executable in browser" message — no fake success.

## 9. Chat & All-in-One

- Verify mode-routing tags `[ROUTE:xyz]` from All-in-One actually navigate.
- Confirm conversation persistence by `modeKey` works across all 10 modes.

## Approach

For each mode I will:
1. Read the workspace file + its key dependencies.
2. Identify any remaining simulation, fake success path, or broken wiring.
3. Apply minimal surgical fixes (no redesigns).
4. Run `tsc --noEmit` after each batch.

## Validation

- Each workspace: open route, send a representative message, verify the response and any action buttons behave honestly (real result OR honest error, never fake success).
- Embedded mode: select each board family, confirm prompt + language switch and code blocks land in correctly-named files.
- All "execute / build / flash / start server" buttons: with agent offline → disabled or honest error; with agent online → real command output.

## Files Likely to Change

| File | Likely change |
|------|----------------|
| `src/pages/IoTWorkspace.tsx` | Route Build/Flash/Serial through real agent; honest disabled states; correct file extensions per board |
| `src/pages/SandboxWorkspace.tsx` | Honest "not executable" for non-Python languages without runtime |
| `src/lib/code-parser.ts` | Add `.ino`/`.py` extension awareness if missing for IoT mode |
| `src/components/PatternsSidebar.tsx` | Verify reads real memory-store, fix if stubbed |
| `src/components/ide/PluginManager.tsx` | Verify real plugin execution path |
| `src/pages/Index.tsx` (mode handlers) | Verify mode-prompt injection for Learning/Jailbreak/Plugin |

Files only touched if a real bug or simulation is found during inspection — minimal surface area.

## Out of Scope

- Settings architecture, routing, sidebar layout, themes — untouched.
- No new modes, no new features beyond making existing ones honest.

