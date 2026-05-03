## Problem

The IDE already has a hidden "System" tab with live hardware metrics, but you have to click into it. You want CPU / RAM / Disk / GPU **always visible** while building in the IDE — like a status bar.

The current header `SystemStatusBar compact` is set to `compact`, which intentionally hides the CPU/RAM badges. That's why nothing shows.

## Fix

1. **Show hardware in the IDE header bar.** Change the IDE page's `<SystemStatusBar compact ... />` to `<SystemStatusBar buildState=... />` (drop `compact`) so CPU% and RAM% badges appear next to Agent / Build / Preview / Model.

2. **Add a dedicated bottom status strip in the IDE** — `src/components/ide/IDEStatusFooter.tsx`. Always rendered at the bottom of `/ide`, single thin row, shows live:
   - CPU: `<model> · <cores>c · NN%`
   - RAM: `used / total GB · NN%`
   - Disk: `used / total GB · NN% (mount)`
   - GPU: `<name>` (or "No GPU")
   - Uptime, load avg
   Pulls from the existing local-agent SSE `http://127.0.0.1:3847/scan/hardware/live` with a polling fallback to `/scan/hardware`. When the agent is offline it shows `Agent offline — start the local agent` with a one-click button (uses existing `downloadAgentScript`). No fake numbers.

3. **Mount the footer in `src/pages/IDE.tsx`** below the main `ResizablePanelGroup`, full-width, ~28px tall, dark `bg-card border-t`. Stays visible regardless of which right-panel tab is active.

4. **Keep the existing System tab** (HardwareMetricsPanel) for the detailed view with progress bars; the new footer is the at-a-glance bar.

## Files

- **New**: `src/components/ide/IDEStatusFooter.tsx`
- **Edited**: `src/pages/IDE.tsx` — drop `compact` on header `SystemStatusBar`, add `<IDEStatusFooter />` at the bottom of the page layout.

No backend changes needed — `server/index.cjs` already exposes CPU, RAM, disk, and GPU through `/scan/hardware` and `/scan/hardware/live`.

## Acceptance

- Open `/ide` with the local agent running → CPU%, RAM%, Disk%, GPU visible at all times in the header **and** in a footer strip, updating live every 2s.
- Local agent offline → footer says "Agent offline" with a "Get Agent" button; no fake metrics anywhere.
