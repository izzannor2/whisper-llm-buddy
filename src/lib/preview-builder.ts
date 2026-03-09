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
 * Build a self-contained HTML string from project files.
 * Supports React/TSX projects by inlining components into a single HTML preview.
 */
export function buildPreviewHTML(files: ProjectFile[]): string {
  const flat = flattenFiles(files);

  // Check if there's a direct index.html
  const indexHtml = flat['/index.html'] || flat['/public/index.html'];
  if (indexHtml && !flat['/src/App.tsx'] && !flat['/src/App.jsx']) {
    // Plain HTML project - inject inline CSS
    let html = indexHtml;
    const cssFile = flat['/styles.css'] || flat['/style.css'] || flat['/src/index.css'];
    if (cssFile) {
      html = html.replace('</head>', `<style>${cssFile}</style></head>`);
    }
    // Inject inline JS
    const jsFile = flat['/script.js'] || flat['/src/main.js'] || flat['/src/index.js'];
    if (jsFile) {
      html = html.replace('</body>', `<script>${jsFile}</script></body>`);
    }
    return html;
  }

  // React project - build a standalone preview
  // Collect all component code
  const components: { path: string; code: string }[] = [];
  for (const [path, code] of Object.entries(flat)) {
    if (/\.(tsx?|jsx?)$/.test(path) && !path.includes('node_modules')) {
      components.push({ path, code });
    }
  }

  // Collect CSS
  const allCSS = Object.entries(flat)
    .filter(([p]) => /\.css$/.test(p))
    .map(([, c]) => c)
    .join('\n');

  // Find the App component
  const appFile = flat['/src/App.tsx'] || flat['/src/App.jsx'] || flat['/App.tsx'] || flat['/App.jsx'];

  if (!appFile && components.length === 0) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Preview</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#888;background:#1a1a2e;">
<div style="text-align:center"><h2 style="color:#e2e8f0">No Preview Available</h2><p>Add files to your project to see a preview here.</p></div>
</body></html>`;
  }

  // Build a simple inline React preview using CDN
  // We'll strip imports/exports and inject components inline
  const processedComponents = components
    .filter(c => c.path !== '/src/main.tsx' && c.path !== '/src/main.jsx')
    .map(c => {
      let code = c.code;
      // Strip import statements
      code = code.replace(/^import\s+.*$/gm, '');
      // Strip export default/named
      code = code.replace(/^export\s+default\s+/gm, 'const __default__ = ');
      code = code.replace(/^export\s+/gm, '');
      // Add component name comment for debugging
      return `// --- ${c.path} ---\n${code}`;
    })
    .join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    ${allCSS.replace(/@tailwind\s+\w+;/g, '').replace(/@layer\s+\w+\s*\{[\s\S]*?\}/g, '').replace(/@import\s+.*$/gm, '').replace(/--[\w-]+:\s*[\d.]+\s+[\d.]+%?\s+[\d.]+%?/g, (m) => m)}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    const { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } = React;

    ${processedComponents}

    // Try to find and render App
    try {
      const AppComponent = typeof App !== 'undefined' ? App : (typeof __default__ !== 'undefined' ? __default__ : null);
      if (AppComponent) {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(AppComponent));
      } else {
        document.getElementById('root').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#64748b;"><div style="text-align:center"><h2 style="color:#e2e8f0">Preview Ready</h2><p>No App component found to render.</p></div></div>';
      }
    } catch (err) {
      document.getElementById('root').innerHTML = '<div style="padding:2rem;font-family:monospace;color:#ef4444;"><h3>Preview Error</h3><pre style="white-space:pre-wrap;margin-top:1rem;background:#1e1e2e;padding:1rem;border-radius:0.5rem;">' + err.message + '</pre></div>';
    }
  </script>
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