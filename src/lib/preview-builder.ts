// Build a live preview HTML blob from project files for iframe rendering
import { ProjectFile } from './ide-types';

/**
 * Flatten a file tree into a flat path->content map.
 */
function flattenFiles(files: ProjectFile[], result: Record<string, string> = {}): Record<string, string> {
  for (const f of files) {
    if (f.isDirectory && f.children) {
      flattenFiles(f.children, result);
    } else if (f.content) {
      result[f.path] = f.content;
    }
  }
  return result;
}

/**
 * Strip TypeScript type annotations, imports, and exports from component code
 * so it can run in a vanilla Babel+React environment.
 */
function processComponentCode(code: string, path: string): string {
  let processed = code;

  // Remove import statements but track what was imported locally
  processed = processed.replace(/^import\s+.*$/gm, '');

  // Convert `export default function X` → `function X`
  processed = processed.replace(/^export\s+default\s+function\s+/gm, 'function ');
  // Convert `export default class X` → `class X`
  processed = processed.replace(/^export\s+default\s+class\s+/gm, 'class ');
  // Convert `export default X;` → (remove line)
  processed = processed.replace(/^export\s+default\s+[\w]+\s*;?\s*$/gm, '');
  // Convert `export function X` → `function X`
  processed = processed.replace(/^export\s+function\s+/gm, 'function ');
  // Convert `export const X` → `const X`
  processed = processed.replace(/^export\s+const\s+/gm, 'const ');
  // Convert `export interface/type` → remove (TS only)
  processed = processed.replace(/^export\s+(interface|type)\s+[\s\S]*?(?=\n(?:const|function|class|export|\/\/|\/\*|$))/gm, '');

  // Remove standalone interface/type declarations (basic TS stripping)
  processed = processed.replace(/^(interface|type)\s+\w+[\s\S]*?^\}/gm, '');

  // Remove `: TypeAnnotation` from function params — simplified
  // Handle `(props: SomeType)` → `(props)`
  processed = processed.replace(/:\s*\w+(?:<[^>]*>)?(?:\s*\|\s*\w+(?:<[^>]*>)?)*(\s*[,\)=])/g, '$1');

  // Remove `as SomeType`
  processed = processed.replace(/\s+as\s+\w+(?:<[^>]*>)?/g, '');

  // Remove generic type params from function declarations `<T>` after function name
  processed = processed.replace(/(function\s+\w+)\s*<[^>]+>/g, '$1');

  return `// --- ${path} ---\n${processed}`;
}

/**
 * Determine component rendering order — App.tsx last since it may reference others.
 */
function sortComponents(components: { path: string; code: string }[]): { path: string; code: string }[] {
  const appIndex = components.findIndex(c => /\/App\.(tsx?|jsx?)$/.test(c.path));
  if (appIndex === -1) return components;
  const app = components[appIndex];
  const rest = components.filter((_, i) => i !== appIndex);
  return [...rest, app];
}

/**
 * Build a self-contained HTML string from project files.
 * Supports React/TSX projects by inlining components into a single HTML preview.
 */
export function buildPreviewHTML(files: ProjectFile[]): string {
  const flat = flattenFiles(files);

  // Check if there's a direct index.html with no React
  const indexHtml = flat['/index.html'] || flat['/public/index.html'];
  if (indexHtml && !flat['/src/App.tsx'] && !flat['/src/App.jsx']) {
    let html = indexHtml;
    const cssFile = flat['/styles.css'] || flat['/style.css'] || flat['/src/index.css'];
    if (cssFile) {
      html = html.replace('</head>', `<style>${cssFile}</style></head>`);
    }
    const jsFile = flat['/script.js'] || flat['/src/main.js'] || flat['/src/index.js'];
    if (jsFile) {
      html = html.replace('</body>', `<script>${jsFile}</script></body>`);
    }
    return html;
  }

  // Collect all component files (skip entry points like main.tsx)
  const entryPaths = ['/src/main.tsx', '/src/main.jsx', '/src/main.ts', '/src/main.js', '/src/index.tsx', '/src/index.jsx'];
  const components: { path: string; code: string }[] = [];
  for (const [path, code] of Object.entries(flat)) {
    if (/\.(tsx?|jsx?)$/.test(path) && !path.includes('node_modules') && !entryPaths.includes(path)) {
      components.push({ path, code });
    }
  }

  // Collect CSS (strip Tailwind directives and @import)
  const allCSS = Object.entries(flat)
    .filter(([p]) => /\.css$/.test(p))
    .map(([, c]) => c)
    .join('\n')
    .replace(/@tailwind\s+\w+\s*;/g, '')
    .replace(/@layer\s+\w+\s*\{[\s\S]*?\}/g, '')
    .replace(/@import\s+.*$/gm, '')
    .replace(/@apply\s+[^;]+;/g, ''); // strip @apply

  const appFile = flat['/src/App.tsx'] || flat['/src/App.jsx'] || flat['/App.tsx'] || flat['/App.jsx'];

  if (!appFile && components.length === 0) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Preview</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#888;background:#0f0f1a;">
<div style="text-align:center"><h2 style="color:#e2e8f0">No Preview Available</h2><p>Add an App component to see a preview here.</p></div>
</body></html>`;
  }

  // Sort components so dependencies come before App
  const sorted = sortComponents(components);
  const processedComponents = sorted
    .map(c => processComponentCode(c.code, c.path))
    .join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: { DEFAULT: '#8b5cf6', foreground: '#fff' },
            secondary: { DEFAULT: '#1e1b4b', foreground: '#e2e8f0' },
            accent: { DEFAULT: '#06b6d4', foreground: '#fff' },
            destructive: { DEFAULT: '#ef4444', foreground: '#fff' },
            muted: { DEFAULT: '#1e1e2e', foreground: '#94a3b8' },
            card: { DEFAULT: '#16162a', foreground: '#e2e8f0' },
            background: '#0f0f1a',
            foreground: '#e2e8f0',
            border: '#2e2e4a',
          }
        }
      }
    }
  <\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #e2e8f0; }
    #__error-overlay { display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.85); padding:2rem; overflow:auto; font-family:monospace; }
    #__error-overlay.visible { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:4rem; }
    #__error-overlay h3 { color:#ef4444; font-size:1.25rem; margin-bottom:1rem; }
    #__error-overlay pre { background:#1e1e2e; color:#f87171; padding:1rem; border-radius:0.5rem; max-width:100%; overflow-x:auto; white-space:pre-wrap; word-break:break-word; font-size:0.8rem; line-height:1.5; }
    #__error-overlay button { margin-top:1rem; padding:0.5rem 1rem; background:#8b5cf6; color:#fff; border:none; border-radius:0.375rem; cursor:pointer; font-size:0.875rem; }
    #__error-overlay button:hover { background:#7c3aed; }
    ${allCSS}
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="__error-overlay">
    <h3>⚠ Preview Error</h3>
    <pre id="__error-message"></pre>
    <button onclick="document.getElementById('__error-overlay').classList.remove('visible')">Dismiss</button>
  </div>
  <script type="text/babel" data-presets="react,typescript">
    const { useState, useEffect, useCallback, useRef, useMemo, useReducer, createContext, useContext, forwardRef, memo, Fragment } = React;

    // Shim for common imports that won't be available
    const cn = (...classes) => classes.filter(Boolean).join(' ');
    const clsx = cn;

    ${processedComponents}

    // Render
    try {
      const AppComponent = typeof App !== 'undefined' ? App : null;
      if (AppComponent) {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(AppComponent));
      } else {
        document.getElementById('root').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#64748b;"><div style="text-align:center"><h2 style="color:#e2e8f0;margin-bottom:0.5rem">Preview Ready</h2><p>Define an App component to see it rendered here.</p></div></div>';
      }
    } catch (err) {
      const overlay = document.getElementById('__error-overlay');
      document.getElementById('__error-message').textContent = err.message + '\\n\\n' + (err.stack || '');
      overlay.classList.add('visible');
      console.error('Preview error:', err);
    }

    // Catch runtime errors too
    window.onerror = function(msg, src, line, col, err) {
      const overlay = document.getElementById('__error-overlay');
      document.getElementById('__error-message').textContent = msg + '\\nLine ' + line + ', Col ' + col + '\\n\\n' + (err?.stack || '');
      overlay.classList.add('visible');
    };
  <\/script>
</body>
</html>`;
}

/**
 * Create a blob URL from HTML string for iframe src.
 */
export function createPreviewBlobUrl(html: string): string {
  const blob = new Blob([html], { type: 'text/html' });
  return URL.createObjectURL(blob);
}
