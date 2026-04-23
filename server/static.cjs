#!/usr/bin/env node
// Zero-dependency static file server for dist/ with SPA fallback.
// Used by start-offline.bat for fully portable USB runtime.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = path.resolve(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

if (!fs.existsSync(ROOT)) {
  console.error(`[WEB] dist/ not found at ${ROOT}`);
  console.error('[WEB] Run scripts\\prepare-usb.bat first to build the app.');
  process.exit(1);
}

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, headers);
  res.end(body);
};

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.join(ROOT, urlPath);

    // Prevent path traversal
    if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');

    // Directory -> index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    // SPA fallback for non-file routes
    if (!fs.existsSync(filePath)) {
      filePath = path.join(ROOT, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    send(res, 200, data, {
      'Content-Type': type,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
  } catch (err) {
    send(res, 500, `Server error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`[WEB] Serving ${ROOT}`);
  console.log(`[WEB] http://localhost:${PORT}`);
});
