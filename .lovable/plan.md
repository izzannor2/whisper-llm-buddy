

# Complete Production-Ready Upgrade — Implementation Plan

This is a massive 19-item scope. Given the Lovable sandbox constraints (browser-based, no Node.js server runtime, no filesystem access), some items need adaptation. Here's the full breakdown organized into implementation batches.

## Constraint: No Local Server in Lovable

**Item 1 (Local Agent Server)** requires a Node.js/Express server. Lovable cannot run persistent Node.js servers in the sandbox. The `server/index.js` file, README, test files, and package.json scripts will be created as static files for users to run locally. The server won't be "live" in preview — it's a self-hosted component.

---

## Batch 1: Core Infrastructure (server, errors, env, config)

### 1. Local Agent Server — `server/index.js` + `server/README.md`
- Express server on port 3847 with full security: command allowlist, path traversal protection, CORS localhost-only, session token auth, rate limiting (token bucket), process tracking, WebSocket terminal streaming, log rotation at 10MB
- Package.json: add `express`, `concurrently`, `ws` as dependencies; add `server`, `dev:all`, `start:prod` scripts
- Update `start.sh` and `start.bat` to launch agent server first, poll port 3847, then start Vite

### 2. Centralized Error Handling — `src/lib/errors.ts`
- `AppError` class with code, message, context, recoverable
- `handleError(err, context)` — normalizes, logs, shows sonner toast
- Wire into chat-api.ts, memory-store.ts, agent libs

### 3. Environment Variables
- Remove `.env` from repo (add to `.gitignore`)
- Create `.env.example` with placeholder values

### 4. Supabase Config
- Update `supabase/config.toml` to declare all 6 edge functions

---

## Batch 2: Auth + First-Run + Settings Validation

### 5. Authentication UI
- `src/components/AuthProvider.tsx` — wraps app, watches `onAuthStateChange`, exposes `useAuth()` hook
- `src/pages/Auth.tsx` — email/password sign-in/sign-up tabs using shadcn/ui
- Add `/auth` route in App.tsx
- "Account" tab in SettingsDialog with sign-in/sign-out
- MemoryPanel: "Sign in to sync memories" banner when unauthenticated

### 6. First-Run Setup — `src/components/FirstRunSetup.tsx`
- Check `localdev-settings` in localStorage on app load
- Modal: backend selection, API key entry, test ping, save settings

### 7. Settings Validation
- `validateSettings()` in chat-api.ts: type checks, numeric clamping, merge with defaults
- Called inside `loadSettings()`

---

## Batch 3: Chat API Hardening

### 8. Frontend Request Safety
- fetchWithRetry: always cleanup AbortController, reader.cancel() in finally
- Buffer incomplete SSE lines safely, log malformed events, never throw on bad SSE
- Timeout-specific error messages

### 9. Anthropic Streaming + Google Streaming
- `sendAnthropicMessage`: real SSE streaming with `stream: true`, parse `content_block_delta` events
- `sendGoogleMessage`: use `streamGenerateContent` endpoint with SSE
- All 6 providers: onChunk with non-empty strings only, reader cleanup in finally, return accumulated string

### 10. Model Fallback
- In `sendChatMessage`: catch primary provider error, if not cloud, retry with cloud/Gemini
- Return `{ response, usedFallback, fallbackReason }`, update call sites

### 11. Updated Model Lists
- Anthropic: claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5-20251001
- Google direct: gemini-2.5-flash, gemini-2.5-pro

---

## Batch 4: Cloud Backend + Web Search

### 12. Self-Hostable Cloud Backend
- In `supabase/functions/chat/index.ts`: check for `GOOGLE_API_KEY` first → direct Google Generative Language API call; fallback to Lovable AI Gateway if `LOVABLE_API_KEY` exists
- Clear 500 error if neither key is set

### 13. Web Search Upgrade
- In `supabase/functions/web-search/index.ts`: primary Brave Search API using `SEARCH_API_KEY`; fallback to existing DuckDuckGo
- Normalize results with `source` field

---

## Batch 5: Frontend Features

### 14. Agent Status Hook — `src/hooks/use-agent-status.ts`
- Polls `localhost:3847/status` every 10s
- Returns `{ connected, version, platform, sessionToken }`
- `AgentStatusIndicator` component — green/red dot in header
- Disable terminal/exec features when offline with tooltip

### 15. App Naming Migration
- Rename "AraChat" → "LocalDev AI" in: `index.html`, `manifest.json`, `DB_NAME` in db.ts, `loadSettings` key in chat-api.ts
- Migration logic in `main.tsx`: copy `arachat-*` localStorage keys to `localdev-*`, migrate IndexedDB, set `localdev-migrated` flag

---

## Batch 6: Plugin + Calculator

### 16. Plugin System Hardening
- Wrap every plugin execution in try/catch
- 5-second timeout via Promise.race
- Track consecutive errors per plugin, auto-disable after 3
- `getPluginStatuses()` function

### 17. Calculator Plugin — `src/plugins/calculator.ts`
- Recursive descent parser: +, -, *, /, ^, parentheses, decimals
- No eval(), returns `{ result, expression }` or error
- Auto-registers on import in plugin-system.ts

---

## Batch 7: Observability + Tests + Docs

### 18. Activity Log
- Extend DebugPanel with circular buffer (100 entries)
- Log plugin executions, exec calls, API calls, errors
- Color-coded, timestamped, "Clear Log" button

### 19. Test Suite
- Install vitest, @testing-library/react, @testing-library/jest-dom
- Tests for: chat-api, db, errors, update-system, calculator plugin, server exec security

### 20. Versioning + Build Info
- Bump package.json to 1.0.0
- Version display in Settings footer
- `server/index.js` reads from package.json
- Create `DEPLOYMENT.md`

### 21. Setup Script
- `scripts/setup.sh` mirroring setup.bat: checks Node ≥18, installs deps, creates config, prints next steps

---

## Files to Create
| File | Purpose |
|------|---------|
| `server/index.js` | Express agent server with security, WS, process mgmt |
| `server/README.md` | Server documentation |
| `server/__tests__/exec-security.test.js` | Security tests |
| `src/lib/errors.ts` | Centralized error handling |
| `src/components/AuthProvider.tsx` | Auth context + useAuth hook |
| `src/pages/Auth.tsx` | Sign-in/sign-up page |
| `src/components/FirstRunSetup.tsx` | First-run setup modal |
| `src/hooks/use-agent-status.ts` | Agent server health polling |
| `src/plugins/calculator.ts` | Calculator plugin |
| `src/lib/__tests__/chat-api.test.ts` | Chat API tests |
| `src/lib/__tests__/db.test.ts` | DB tests |
| `src/lib/__tests__/errors.test.ts` | Error handling tests |
| `src/lib/__tests__/update-system.test.ts` | Update system tests |
| `src/plugins/__tests__/calculator.test.ts` | Calculator tests |
| `.env.example` | Environment template |
| `DEPLOYMENT.md` | Deployment documentation |
| `scripts/setup.sh` | Unix setup script |

## Files to Modify
| File | Changes |
|------|---------|
| `package.json` | Version 1.0.0, add deps + scripts |
| `src/App.tsx` | Add /auth route, AuthProvider wrapper |
| `src/main.tsx` | AraChat→LocalDev migration logic |
| `index.html` | Rename AraChat → LocalDev AI |
| `public/manifest.json` | Rename AraChat → LocalDev AI |
| `src/lib/chat-api.ts` | Settings validation, streaming fixes, model fallback, updated models, key migration |
| `src/lib/db.ts` | DB_NAME → LocalDevAI |
| `src/lib/plugin-system.ts` | Timeout, error tracking, auto-disable, calculator registration |
| `src/lib/memory-store.ts` | Error handling with errors.ts |
| `src/components/SettingsDialog.tsx` | Account tab, version footer |
| `src/components/DebugPanel.tsx` | Activity log circular buffer |
| `src/components/MemoryPanel.tsx` | Auth-aware banner |
| `src/components/NetworkStatusIndicator.tsx` | Agent status indicator |
| `supabase/functions/chat/index.ts` | Google API direct call + fallback |
| `supabase/functions/web-search/index.ts` | Brave Search primary + DDG fallback |
| `supabase/config.toml` | Declare all 6 edge functions |
| `start.sh` | Launch agent server first |
| `start.bat` | Launch agent server first |
| `.gitignore` | Add .env |

## What Won't Change
- All existing routing, page components, OpenClaw logic, IDE components
- shadcn/ui setup, Tailwind config
- Existing voice mode, TTS, update system
- Supabase client.ts and types.ts (auto-generated)

