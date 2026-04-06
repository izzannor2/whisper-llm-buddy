

# Fix Ollama & Llama.cpp Portable Detection + Model Dropdown

## What's Working
- **Start scripts** (`start.bat`, `start.sh`): Correctly detect portable binaries in `bin/ollama/` and `bin/llama/`, auto-launch servers, and auto-pull models. No changes needed.
- **Chat API** (`src/lib/chat-api.ts`): All 7 backends (cloud, local, ollama, openai, anthropic, google, huggingface) are fully implemented with streaming. No changes needed.
- **Ollama client** (`src/lib/ollama-client.ts`) and **Llama.cpp client** (`src/lib/llama-cpp-client.ts`): Both complete. No changes needed.

## What's Broken

1. **No llama.cpp in the model dropdown**: The inline model switcher in `ChatInput.tsx` shows Cloud, Ollama, OpenAI, Anthropic, Google — but no "LLAMA.CPP / LOCAL" option. If a user has a portable llama-server running on port 8081, they cannot switch to it from the chat bar.

2. **No llama.cpp auto-detection on app load**: `Index.tsx` scans Ollama on mount but never checks if llama-server is running at `127.0.0.1:8081`. The user has to manually go to Settings to switch.

3. **Ollama scan fires in cloud preview**: The scan in `Index.tsx` always tries `localhost:11434` even when running on `lovable.app`, causing a "Failed to fetch" network error in the console. Should be skipped.

## Changes

### 1. `src/pages/Index.tsx` — Add llama.cpp scan + cloud preview guard
- Add an `isCloudPreview()` check before the Ollama/llama.cpp scans (skip both when on `lovable.app`)
- Add a parallel scan to `http://127.0.0.1:8081/health` with a 3-second timeout
- Store result in new state `llamaCppAvailable: boolean`
- Pass `llamaCppAvailable` to `ChatInput`

### 2. `src/components/ChatInput.tsx` — Add llama.cpp section to dropdown
- Accept new prop `llamaCppAvailable?: boolean`
- Add a "LLAMA.CPP" section in the model dropdown (between Ollama and OpenAI) when `llamaCppAvailable` is true
- Single item: "Local Model (port 8081)" — clicking switches backend to `'local'`
- Update `currentModelName` to show "Llama.cpp" when backend is `'local'`

### 3. Minor: Suppress console noise
- The Ollama scan `catch {}` already silences errors, but the network tab still shows a failed request when in cloud preview. The `isCloudPreview` guard fixes this.

## Files to Modify
- `src/pages/Index.tsx` — Add cloud preview guard, add llama.cpp health check
- `src/components/ChatInput.tsx` — Add `llamaCppAvailable` prop and dropdown section

## What This Achieves
When you run the app locally with portable Ollama in `bin/ollama/` or portable llama-server in `bin/llama/`:
- The start script auto-launches them
- The app auto-detects them on load
- They appear in the model dropdown for instant switching
- No manual settings configuration needed

