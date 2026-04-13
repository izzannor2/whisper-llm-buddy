

# Fix Preview — Auto-Stub Undefined Components Before Code Runs

## Problem
The current Proxy-based safety net doesn't work. A `Proxy` on `window` only intercepts property access *through that proxy object* — it doesn't intercept bare variable references like `Footer` in JavaScript. So when React tries to render `<Footer />`, it's a direct scope lookup that bypasses the proxy entirely, and the `error` event listener fires too late (React has already crashed).

## Fix
Replace the broken Proxy approach with **static analysis + pre-declaration**. After processing all components, scan the combined code for capitalized identifiers used in JSX (e.g., `React.createElement(Footer`, `<Footer`) that aren't defined anywhere in the processed code, then emit `var Footer = ...stub...` declarations before the user code runs.

### In `src/lib/preview-builder.ts`:

1. **Add a `findUndefinedComponents()` function** that:
   - Scans the `processedComponents` string for all capitalized identifiers used as component references (pattern: `React.createElement(Name` after Babel transforms, or raw `<Name` in JSX)
   - Collects all `const/let/var/function Name` declarations in the processed code
   - Also includes all names from the library shims (the known set: `Button`, `Card`, `Dialog`, `Toaster`, `Link`, `motion`, icons, etc.)
   - Returns the difference: names referenced but never declared

2. **Generate stub declarations** for each undefined name:
   ```javascript
   var Footer = function(props) {
     return React.createElement('div', {
       style: { padding:'16px', border:'1px dashed rgba(234,179,8,0.3)', borderRadius:'8px', margin:'4px 0' },
       'data-stub-component': 'Footer'
     }, props && props.children ? props.children : React.createElement('span', {style:{color:'rgba(234,179,8,0.5)',fontSize:'12px'}}, '⚠ Footer'));
   };
   ```

3. **Insert stubs between shims and user code** (replace the broken Proxy block at lines 780-817)

4. **Keep the error listener** as a last-resort fallback, but make it call `location.reload()` after stubbing, so the preview retries automatically on edge cases

## Files Changed
| File | Change |
|------|--------|
| `src/lib/preview-builder.ts` | Replace Proxy block with static-analysis stub generation; add `findUndefinedComponents()` helper |

