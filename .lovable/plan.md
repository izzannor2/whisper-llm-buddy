

## Plan: Make All 9 Modes Functional with Unique Themes

### Current State
- Modes are selectable in the sidebar dropdown but most do nothing beyond changing a label
- App Builder navigates to `/ide` (works)
- All modes share the same teal accent color and dark theme
- The `EmptyState` has per-mode content but no visual differentiation
- The system prompt in `chat-api.ts` is static — it never changes per mode
- No mode-specific behavior exists in the chat flow

### What Each Mode Will Do

| Mode | Theme Color | Behavior |
|------|------------|----------|
| **Chat** | Teal (current default) | General conversation, no special behavior |
| **App Builder** | Purple | Navigates to `/ide` (already works) |
| **IoT / Embedded** | Orange | System prompt for hardware code, board selector in input area |
| **System Helper** | Amber/Yellow | System prompt for system tasks, confirmation UI for commands |
| **AI Improvement** | Pink/Magenta | System prompt to analyze & improve this app itself |
| **Learning** | Green | System prompt focused on learning user patterns |
| **Sandbox** | Cyan | System prompt for safe experimentation, warning banner |
| **Uncensored** | Red | Uses custom jailbreak prompt from settings, danger styling |
| **Plugin** | Blue | System prompt for plugin management |

### Implementation (4 files)

**1. New file: `src/lib/mode-themes.ts`**
- Define a `MODE_THEMES` map with per-mode: accent HSL, gradient, system prompt, icon color class, CSS custom properties
- Export a `getModeTheme(modeKey)` function and `getModeSystemPrompt(modeKey)` function

**2. `src/pages/Index.tsx`**
- On mode change, apply CSS custom properties to `document.documentElement` (override `--accent`, `--primary`, `--ring` etc.)
- Pass `currentModeKey` to `EmptyState` for theme-aware rendering
- Inject mode-specific system prompt into the `sendChatMessage` call by prepending it to messages
- Restore theme on mount from saved modeKey

**3. `src/components/EmptyState.tsx`**
- Use `getModeTheme()` to render mode-specific accent colors, gradient backgrounds, and unique icons per mode
- Add a mode-specific banner/badge at the top (e.g., red warning for Uncensored, green leaf for Learning)
- Update suggestions styling to use mode accent

**4. `src/components/ChatSidebar.tsx`**
- Color-code each mode in the dropdown with its theme color
- Show the active mode's accent color on the selected item

**5. `src/components/ChatInput.tsx`**
- Show current mode name/badge near the input
- For System Helper mode: add a note about command confirmation
- For Uncensored: show a subtle warning indicator

### How Mode Themes Work (Technical)
Each mode overrides CSS custom properties at runtime:
```typescript
// Example: System Helper mode
document.documentElement.style.setProperty('--accent', '45 93% 47%'); // amber
document.documentElement.style.setProperty('--primary', '45 93% 47%');
```
This cascades through all existing components without any per-component changes.

### How Mode System Prompts Work
Each mode gets a tailored system prompt prepended to conversations:
- **IoT**: "You are an embedded systems expert specializing in ESP32, Arduino..."
- **System Helper**: "You help with system administration tasks. Always present commands in code blocks..."
- **AI Improvement**: "You analyze the LocalDev AI codebase and suggest improvements..."
- **Uncensored**: Uses the user's custom `jailbreakPrompt` from settings

The mode's system prompt is merged with the user's custom system prompt from settings.

