

# Sidebar Dropdown Grouping

## What We're Doing
Organize the flat list of sidebar buttons (New Chat, My Apps, File Search, AI Memory, Auto-Build, Task Graph, Models, System Files, PC Search) into collapsible dropdown sections so the sidebar looks cleaner and more professional.

## Grouping Structure

```text
┌─────────────────────────┐
│ [Mode Selector ▼]       │
│ [Search chats...]       │
├─────────────────────────┤
│ + New Chat              │
├─────────────────────────┤
│ ▸ Browse           (3)  │  ← My Apps, File Search, PC Search
│ ▸ AI Tools         (3)  │  ← AI Memory, Auto-Build, Task Graph
│ ▸ System           (2)  │  ← Models, System Files
├─────────────────────────┤
│ Online | Lock           │
├─────────────────────────┤
│ [conversation list]     │
└─────────────────────────┘
```

Each group uses a `Collapsible` component (already in the project) with a header that toggles open/closed. The groups remember their open/closed state.

## Changes

### `src/components/ChatSidebar.tsx`
- Import `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `@/components/ui/collapsible`
- Replace the flat button list (lines 242-321) with three collapsible sections:
  - **Browse**: My Apps (with count badge), File Search, PC Search
  - **AI Tools**: AI Memory, Auto-Build, Task Graph
  - **System**: Models link, System Files
- Keep "New Chat" as a standalone top button (always visible)
- Each section header shows a chevron that rotates on open/close
- Status row (Online/Lock) stays outside the groups at the bottom
- Use `useState` with defaults open for "Browse", closed for others

