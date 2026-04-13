

# Fix Preview "ReferenceError: Features is not defined"

## Problem
The preview builder strips all `import` statements but the dependency resolution only works for components that exist as separate files in the project. When `App.tsx` references `Features` (or any component name), and that component either:
- Is defined in a file whose name doesn't get matched by the dependency graph
- Isn't a separate file at all (inline or missing)
- Gets stripped incorrectly

...the preview crashes with `ReferenceError: Features is not defined`.

## Root Cause
Line 762-796 in `preview-builder.ts`: after stripping imports and injecting shims, the code runs directly. Any name that isn't defined as a shim or extracted from a project file causes an immediate crash. There's no safety net.

## Fix — Add a Global Undefined-Component Safety Net

In `src/lib/preview-builder.ts`, add a `Proxy` on `window` that auto-creates stub components for any undefined uppercase-starting name (React component convention). This goes right before the user's processed components are injected.

```javascript
// Before user components — catch-all for undefined component references
const __componentProxy = typeof Proxy !== 'undefined' ? new Proxy(window, {
  get(target, prop) {
    if (typeof prop === 'string' && prop[0] === prop[0]?.toUpperCase() && /^[A-Z]/.test(prop) && !(prop in target)) {
      const Stub = (props) => React.createElement('div', { 
        className: 'p-4 border border-dashed border-yellow-500/30 rounded-md',
        'data-component': prop 
      }, props.children || React.createElement('span', { className: 'text-yellow-500/60 text-xs' }, prop));
      target[prop] = Stub;
      return Stub;
    }
    return target[prop];
  }
}) : null;
```

This ensures that any capitalized name reference (`Features`, `Hero`, `Footer`, etc.) that isn't already defined will render as a visible placeholder div instead of crashing.

## Files Changed
| File | Change |
|------|--------|
| `src/lib/preview-builder.ts` | Add Proxy-based catch-all for undefined components, inserted after shims and before user code |

