

# Fix Model Dropdown to Show Correct Models Per Backend

## Problem
The model dropdown button always displays "Cloud" even after switching to Ollama or Llama.cpp. When you select an Ollama model, the button text doesn't update to show the model name. Llama.cpp only shows a generic "Local Model" instead of the actual loaded GGUF model name.

## Root Causes
1. `getBackendDisplayName()` returns just `"Cloud"` for the cloud backend — doesn't show which cloud model is selected (e.g., "Gemini 2.5 Flash")
2. Llama.cpp section hardcodes "Local Model (port 8081)" instead of fetching the actual model name from the server's `/v1/models` endpoint
3. The display name function works correctly for Ollama (`settings.ollamaModel`), but if the settings state isn't persisting the `ollamaModel` field properly on switch, it could still show "Ollama"

## Fixes

### 1. Show actual model name in button text for all backends
**File: `src/components/ChatInput.tsx`** — Update `getBackendDisplayName()`:
- `cloud`: Look up `settings.model` in `CLOUD_MODELS` array and return its display name (e.g., "Gemini 2.5 Flash"), fallback to "Cloud"
- `local`: Show the actual llama.cpp model name from a new `llamaCppModels` prop instead of hardcoded text
- `ollama`: Already correct, but add the "Ollama:" prefix so it's clear which backend

### 2. Fetch actual llama.cpp model names from `/v1/models`
**File: `src/pages/Index.tsx`** — In the init scan, when llama.cpp health check passes, also fetch `http://127.0.0.1:8081/v1/models` to get the list of loaded model names. Store them in a new `llamaCppModels` state array and pass to ChatInput.

### 3. Show llama.cpp models individually in dropdown
**File: `src/components/ChatInput.tsx`** — Replace the single hardcoded "Local Model (port 8081)" entry with a dynamic list from the new `llamaCppModels` prop. Each model gets its own selectable row, just like Ollama models.

### Files to Modify
- `src/pages/Index.tsx` — Add `llamaCppModels` state, fetch from `/v1/models` endpoint during init scan, pass as prop
- `src/components/ChatInput.tsx` — Accept `llamaCppModels` prop, update `getBackendDisplayName()` to show actual model names for all backends, render llama.cpp models dynamically

