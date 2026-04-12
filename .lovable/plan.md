

# Fix App Builder Preview — Make It Work Like a Real Live Preview

## Current Problems

1. **Auto-preview fires but often shows errors** — The regex-based TypeScript stripping in `preview-builder.ts` is fragile. It breaks on:
   - Arrow function components (`const App = () => ...` with `export default App` at bottom)
   - Destructured props with type annotations (`{ name, count }: Props`)
   - Generic components (`function List<T>(...)`)
   - Multi-line type annotations and complex union types
   - `React.FC<Props>` type annotations
   - Enum declarations

2. **No dependency resolution** — Components reference each other by name, but the ordering logic only sorts `App` to last. If `PageA` imports `Header`, `Header` must come first — but there's no dependency graph.

3. **Missing shims** — Common patterns like `lucide-react` icons, `react-router-dom` hooks, `framer-motion`, `uuid` are not shimmed, causing immediate runtime errors.

4. **Preview doesn't auto-refresh smoothly** — Blob URL changes cause a full iframe reload with a white flash instead of a smooth transition.

5. **No loading state** — When the preview is being generated, the user sees nothing.

## Plan

### 1. Rewrite `src/lib/preview-builder.ts` — Better TS Stripping + Dependency Sorting

**TypeScript stripping improvements:**
- Handle `const X: React.FC<Props> = ...` → strip the `: React.FC<Props>` part
- Handle arrow function default exports: `export default App` at end of file → keep the variable, remove the export line
- Handle `interface X { ... }` blocks properly using brace-counting instead of regex lookahead
- Handle `type X = ...;` single-line types
- Handle `as const` assertions
- Handle generic arrow functions `const fn = <T,>(x: T) => ...` → `const fn = (x) => ...`
- Handle optional chaining types `x?: Type` → `x`
- Handle return type annotations `(): ReturnType => ...` → `() => ...`

**Dependency sorting:**
- Build a simple dependency graph: scan each file for references to function/const names defined in other files
- Topological sort so dependencies render before dependents
- App.tsx always last

**Library shims — add stubs for commonly used packages:**
- `lucide-react`: Shim all icon names as simple SVG placeholder components
- `react-router-dom`: Shim `Link`, `useNavigate`, `useParams`, `BrowserRouter`, `Routes`, `Route`, `Outlet`
- `framer-motion`: Shim `motion.div` etc. as passthrough divs
- `@/lib/utils` and `@/components/ui/*`: Already handled by `cn` shim, extend with more shadcn stubs
- `uuid`/`nanoid`: Simple random string generators
- `date-fns`/`dayjs`: Basic `format()` shim

### 2. Update `src/components/ide/PreviewPane.tsx` — Smoother UX

- Add a brief loading spinner overlay during preview generation
- Use `iframe.srcdoc` instead of blob URLs to avoid white flash on refresh (set HTML directly)
- Show a small "Last updated: Xs ago" in the status bar
- When preview has an error, show a friendly inline error with the component name that failed

### 3. Update `src/pages/IDE.tsx` — Preview Trigger Improvements

- Keep the existing 600ms debounce auto-preview
- Add a "hot reload" mode: when a single file changes, only re-process that file's code and post a message to the iframe to re-render (avoid full page reload)
- Ensure `generatePreview` is called after every code block application from AI

## Files Changed

| File | Change |
|------|--------|
| `src/lib/preview-builder.ts` | Rewrite TS stripping, add dependency graph sorting, add library shims |
| `src/components/ide/PreviewPane.tsx` | Switch to `srcdoc`, add loading state, smoother refresh |
| `src/pages/IDE.tsx` | Minor: ensure preview triggers correctly on all code changes |

## What Stays the Same
- All existing IDE layout, file tree, code editor, chat panel
- The dev server start/stop flow (for real local agent)
- The "Generate Preview" button behavior
- Device size toggles and responsive preview frame

