

# Make Web Search Actually Work When Online

## Problem
The web search IS working technically (the backend returns results), but there are two disconnected toggles:
- **Sidebar "Online/Offline"** toggle — controls which AI backend to use
- **Globe "Search" button** in chat input — controls whether web search runs before each message

You have to click BOTH to get web search. Most users expect that being "Online" means web search is active.

## Fix

### 1. Auto-enable web search when going online
**File: `src/pages/Index.tsx`**
- In `handleToggleOffline`, when switching TO online mode (`newOffline = false`), also set `setWebSearchEnabled(true)`
- When switching TO offline mode (`newOffline = true`), set `setWebSearchEnabled(false)` (web search can't work without internet anyway)
- This way the globe button automatically lights up when you go online

### 2. Disable globe button when offline
**File: `src/components/ChatInput.tsx`**
- Accept new prop `isOfflineMode?: boolean`
- When `isOfflineMode` is true, disable the globe button and show tooltip "Go online to use web search"
- Prevents confusion about why search isn't working

### 3. Better visual feedback when search runs
**File: `src/pages/Index.tsx`**
- Add a brief "Searching the web..." toast BEFORE the search runs (not just after results come back)
- This gives immediate feedback that something is happening when the user sends a message with search enabled

## Files to Modify
- `src/pages/Index.tsx` — Link online toggle to web search toggle, add pre-search toast
- `src/components/ChatInput.tsx` — Accept `isOfflineMode` prop, disable globe when offline

