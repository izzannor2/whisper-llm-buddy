

# App Builder + AI Improvement — Final Honesty & Stability Pass

Targeted cleanup. No redesign. No new files. Surgical fixes to remove the last simulation, stabilize live preview, and make both modes behave like a real Lovable-style "instant preview" workflow.

## 1. `src/pages/IDE.tsx` — Remove last simulation, stabilize streaming preview

**`handleStartServer` (line 384–389)** — currently fakes a running dev server when the local agent returns `null`:
- Replace with honest behavior: if `startDevServer()` returns a real result → set running state and real URL. If it returns `null` → show a toast `"Local agent not connected (port 3847). Start the agent to run a dev server."`, log the same line to `errors`, and **leave `isServerRunning` false**. No fake URL, no `[Simulated]` log.

**Streaming live-preview hot loop (lines 296–317)** — currently calls `generatePreview(updatedFiles)` on every applied block, which:
- forces `setRightPanelTab('preview')` mid-stream (causes the right pane to keep yanking to Preview while the user might be on Debug/Terminal)
- duplicates work with the debounced `project.updatedAt` effect at lines 146–157

Fix:
- Add a small `liveStreamPreview` helper that only calls `buildPreviewHTML(updatedFiles)` and `setPreviewHtml(html)` — does NOT switch tabs.
- Throttle to at most one rebuild every ~400ms during streaming using a ref-tracked timestamp.
- Keep the post-stream `generatePreview(updatedFiles)` (line 349) as the single place that switches the tab to Preview when the response completes.

**Wire `onOpenExternal`** on `PreviewPane`:
- Pass `onOpenExternal={() => { if (previewUrl) window.open(previewUrl, '_blank'); else if (previewHtml) { const blob = new Blob([previewHtml], {type:'text/html'}); window.open(URL.createObjectURL(blob), '_blank'); } }}`.

## 2. `src/components/ide/PreviewPane.tsx` — Honest dev-server button

- Add an optional `agentConnected?: boolean` prop.
- If `agentConnected === false` and not running, the Start Dev Server button is **disabled** with tooltip `"Local agent offline (port 3847)"`. The empty-state secondary button gets the same disabled state with helper text "Requires LocalDev Agent".
- If running, keep the Stop button as-is.
- Hide the `ExternalLink` button when no `onOpenExternal` is supplied (already conditional on prop existence in JSX where applicable — verify and tighten).

`IDE.tsx` passes `agentConnected={agentStatus.connected}`.

## 3. `src/pages/ImproveWorkspace.tsx` — Honest preview, working debug bridge

**Preview build effect (lines 273–290)** currently swallows errors:
- Replace empty `catch {}` with `catch (err) { setPreviewHtml(''); setPreviewError(String((err as Error)?.message || err)); }`.
- Add a small `previewError` state. When set, the Preview tab renders a red error card instead of an empty/stale iframe so users see what went wrong.

**Preview iframe sandbox (line 1016)**:
- Change `sandbox="allow-scripts"` to `sandbox="allow-scripts allow-same-origin"` to match IDE preview and let the existing `postMessage` debug bridge in `preview-builder.ts` actually deliver console/error messages.

**Add a "Refresh" button** next to Open/Upload in the right-pane header (only when `rightTab === 'preview'`):
- Re-runs the build by toggling a `previewKey` state used as the iframe `key`, so users can force-rebuild after editing files outside the chat.

## 4. Validation

- `/ide` loads, sending a message in App Builder mode streams code → preview pane updates progressively without ripping the user off other tabs; final message commits the tab switch once.
- Dev server start with no agent connected shows a real error toast and the button stays in "Start" state — no fake green dot, no fake URL.
- Open External actually opens the current preview in a new tab.
- AI Improvement: previewing broken code now shows a visible error in the Preview tab; iframe console errors flow through the existing debug bridge.
- No new dependencies. No settings architecture changes. No file deletions.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/IDE.tsx` | Remove dev-server simulation; throttle streaming preview; stop forcing tab switch mid-stream; wire `onOpenExternal`; pass `agentConnected` |
| `src/components/ide/PreviewPane.tsx` | Disable Start Dev Server when agent offline; tooltips; tighten ExternalLink visibility |
| `src/pages/ImproveWorkspace.tsx` | Surface preview build errors; fix iframe sandbox; add Refresh button |

