

# Add Comprehensive Settings System (Providers, Runtime, Tools, Assistants, Status)

## Goal
Build a structured Settings panel that replaces hidden defaults with explicit, persisted, user-controlled config — without touching the working preview pipeline.

## Architecture

### New central config store
**`src/lib/config-store.ts`** — single source of truth, localStorage-persisted, with typed shapes:
- `ProviderConfig` — toggles + URLs + API key for LocalDev Agent, Llama, Ollama, Remote API; selected provider; selected model
- `RuntimeConfig` — `enablePreviewRuntime`, `useLocalDevAgent`, `useDevServer`, `forceLocalPreview`, `previewMode: 'auto' | 'local-only' | 'runtime-only'`
- `ToolConfig` — booleans for File Editor, Terminal, Preview Control, API Caller, Voice, Camera
- `AssistantConfig[]` — `{ id, name, description, systemPrompt, model, permissions:{ editFiles, runPreview, callAgent, useTools, accessApis } }` + `activeAssistantId`

Exports `useConfig()` hook (subscribes via `window` event) and `getConfig()/setConfig()` helpers. All defaults preserve current behavior.

### Model fetching
**`src/lib/model-discovery.ts`** — small helpers:
- `fetchOllamaModels(url)` → `GET /api/tags`
- `fetchLlamaModels(url)` → `GET /v1/models`
- `fetchAgentModels(url)` → `GET /models`
- `fetchRemoteModels(baseUrl, key)` → `GET /v1/models`
- `testConnection(provider)` → `{ ok, error?, models? }`

Reuses existing `fetchBlackboxModels` pattern. No hardcoded model names.

### New Settings page
**`src/pages/Settings.tsx`** — route `/settings`, uses existing shadcn Tabs:
- **Providers** — 4 cards (LocalDev Agent, Llama, Ollama, Remote API) with enable toggle + URL input + Test Connection button + dynamic model dropdown (fallback to text input on fetch failure)
- **Runtime** — toggles for Preview Runtime / LocalDev Agent / Dev Server / Force Local Preview + Preview Mode dropdown. Banner: "Preview always falls back to local rendering"
- **Tools** — 6 toggle rows with icons + descriptions
- **Assistants** — list + Create/Edit/Delete + Active selector. Form with Name, Description, System Prompt textarea, Model dropdown (from configured providers), 5 permission toggles
- **Status** — live rows for Agent / Preview Runtime / Current Preview Mode / Llama / Ollama. Each clickable to expand error details. Polls every 5s

### Routing
**`src/App.tsx`** — add `<Route path="/settings" element={<Settings />} />`

### Sidebar entry
Locate existing sidebar component (likely `ChatSidebar.tsx` or similar) — add a "Settings" nav link under the System group. (Plan: read sidebar file first to match existing pattern; don't rewrite it.)

### Preview safety wiring
**`src/pages/IDE.tsx`** — minimal change: read `RuntimeConfig` and:
- If `forceLocalPreview === true` OR `previewMode === 'local-only'` → skip any runtime/agent path, always use existing `generatePreview()` srcdoc
- If runtime path fails → fall back to `generatePreview()` (already the default — just guard it)

**No changes** to `src/lib/preview-builder.ts`, srcDoc logic, or stub system. Preview always renders from project files.

## Files Created
| File | Purpose |
|------|---------|
| `src/lib/config-store.ts` | Central typed config + localStorage + event bus |
| `src/lib/model-discovery.ts` | Provider model fetchers + connection tests |
| `src/pages/Settings.tsx` | Full tabbed settings page |
| `src/components/settings/ProvidersTab.tsx` | Providers UI |
| `src/components/settings/RuntimeTab.tsx` | Runtime UI |
| `src/components/settings/ToolsTab.tsx` | Tools UI |
| `src/components/settings/AssistantsTab.tsx` | Assistants CRUD UI |
| `src/components/settings/StatusTab.tsx` | Live status rows |

## Files Modified (minimal)
| File | Change |
|------|--------|
| `src/App.tsx` | Add `/settings` route |
| Existing sidebar component | Add Settings nav link in System group |
| `src/pages/IDE.tsx` | Read `RuntimeConfig`; guard runtime path; always allow local fallback |

## Preview Safety Guarantees
- `preview-builder.ts` — untouched
- `iframe.srcDoc` flow — untouched
- Stub/safety-net system — untouched
- New runtime toggles only **gate** optional runtime usage; local srcdoc remains the default and the fallback

## Out of Scope (intentional)
- No backend wiring for Tools (UI + state only as requested)
- No transport/sync changes
- No rewrite of existing `SettingsDialog.tsx` (leaves legacy settings intact; new page is additive)

