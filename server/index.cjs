/**
 * LocalDev AI — Local Agent Server
 * Express server on port 3847 with security, WebSocket terminal streaming, and process management.
 * Run: node server/index.js
 */

const express = require('express');
const http = require('http');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Optional WebSocket support
let WebSocket;
try { WebSocket = require('ws'); } catch { WebSocket = null; }

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3847;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDev = NODE_ENV === 'development';

// Session token generated on startup
const SESSION_TOKEN = crypto.randomBytes(16).toString('hex');

// Project root = one directory up from server/
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ===== Logging =====
const LOG_DIR = path.join(PROJECT_ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  if (isDev) process.stdout.write(line);
  try {
    const stats = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE) : null;
    if (stats && stats.size > MAX_LOG_SIZE) {
      const bakPath = LOG_FILE + '.bak';
      if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
      fs.renameSync(LOG_FILE, bakPath);
    }
    fs.appendFileSync(LOG_FILE, line);
  } catch { /* ignore log errors */ }
}

// ===== Rate Limiting (Token Bucket) =====
const rateBuckets = new Map();

function rateLimit(key, maxPerMinute) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart > 60000) {
    bucket = { windowStart: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count > maxPerMinute;
}

// ===== Middleware =====
app.use(express.json({ limit: '1mb' }));

// CORS — localhost only
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-agent-session');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  } else {
    return res.status(403).json({ error: 'Forbidden: external origin' });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Session auth for /exec and /file
function requireSession(req, res, next) {
  const token = req.headers['x-agent-session'];
  if (token !== SESSION_TOKEN) {
    return res.status(401).json({ error: 'Invalid session token. Get token from GET /status.' });
  }
  next();
}

// ===== Command Allowlist & Block Patterns =====
const ALLOWED_COMMANDS = ['node', 'npm', 'npx', 'bun', 'git', 'ls', 'dir', 'cat', 'echo', 'pwd', 'python', 'python3', 'pip', 'ollama'];
const BLOCKED_PATTERNS = [
  /rm\s+-rf/i, /shutdown/i, /\bformat\b/i, /del\s+\/f/i, /mkfs/i,
  /:\(\)\{.*\|.*&\}.*;/i, />\s*\/dev\/sd/i, /dd\s+if=/i,
];
const MAX_OUTPUT = 100 * 1024; // 100KB
const EXEC_TIMEOUT = 30000; // 30s

function validateCommand(cmd) {
  const trimmed = cmd.trim();
  const baseCmd = trimmed.split(/\s+/)[0].replace(/^\.\//, '').replace(/\\/g, '/').split('/').pop();
  if (!ALLOWED_COMMANDS.includes(baseCmd)) {
    return `Command not allowed: ${baseCmd}. Allowed: ${ALLOWED_COMMANDS.join(', ')}`;
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) return `Blocked: command matches dangerous pattern`;
  }
  return null;
}

// ===== Path Safety =====
function safePath(requestedPath) {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath);
  if (!resolved.startsWith(PROJECT_ROOT)) {
    return null;
  }
  if (requestedPath.includes('..')) return null;
  return resolved;
}

// ===== Process Tracking =====
const trackedProcesses = new Map();

function trackProcess(child) {
  trackedProcesses.set(child.pid, child);
  child.on('exit', () => trackedProcesses.delete(child.pid));
}

// ===== WebSocket clients =====
const wsClients = new Set();

// ===== Routes =====

// GET /status
app.get('/status', (req, res) => {
  let version = '1.0.0';
  try {
    const pkg = require(path.join(PROJECT_ROOT, 'package.json'));
    version = pkg.version || version;
  } catch {}
  res.json({
    version,
    platform: process.platform,
    capabilities: ['exec', 'file', 'npm', 'process'],
    sessionToken: SESSION_TOKEN,
    uptime: process.uptime(),
  });
});

// POST /exec
app.post('/exec', requireSession, (req, res) => {
  if (rateLimit('exec', 30)) {
    return res.status(429).json({ error: 'Rate limit exceeded (30/min)' });
  }

  const { command, confirm } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command string required' });
  }

  const validationError = validateCommand(command);
  if (validationError) {
    return res.status(403).json({ error: validationError });
  }

  log(`EXEC: ${command}`);
  const startTime = Date.now();

  const child = exec(command, {
    cwd: PROJECT_ROOT,
    timeout: EXEC_TIMEOUT,
    maxBuffer: MAX_OUTPUT,
    env: { ...process.env, FORCE_COLOR: '0' },
  }, (error, stdout, stderr) => {
    const duration = Date.now() - startTime;
    const exitCode = error ? error.code || 1 : 0;
    log(`EXEC DONE: "${command}" exit=${exitCode} ${duration}ms`);

    let output = stdout || '';
    let truncated = false;
    if (output.length > MAX_OUTPUT) {
      output = output.slice(0, MAX_OUTPUT);
      truncated = true;
    }

    res.json({
      exitCode,
      stdout: output,
      stderr: stderr || '',
      truncated,
      duration,
      error: error ? (isDev ? error.message : 'Command failed') : null,
    });
  });

  trackProcess(child);

  // Broadcast to WebSocket clients
  if (child.stdout) {
    child.stdout.on('data', (data) => {
      const msg = JSON.stringify({ type: 'stdout', data: data.toString() });
      for (const ws of wsClients) {
        try { ws.send(msg); } catch {}
      }
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (data) => {
      const msg = JSON.stringify({ type: 'stderr', data: data.toString() });
      for (const ws of wsClients) {
        try { ws.send(msg); } catch {}
      }
    });
  }
});

// POST /file
app.post('/file', requireSession, (req, res) => {
  const { action, filePath, content } = req.body;
  if (!action || !filePath) {
    return res.status(400).json({ error: 'action and filePath required' });
  }

  const resolved = safePath(filePath);
  if (!resolved) {
    return res.status(403).json({ error: 'Path outside project root' });
  }

  log(`FILE ${action}: ${filePath}`);

  try {
    switch (action) {
      case 'read':
        if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });
        res.json({ content: fs.readFileSync(resolved, 'utf-8') });
        break;
      case 'write':
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, content || '');
        res.json({ success: true });
        break;
      case 'delete':
        if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) fs.rmSync(resolved, { recursive: true });
        else fs.unlinkSync(resolved);
        res.json({ success: true });
        break;
      case 'mkdir':
        fs.mkdirSync(resolved, { recursive: true });
        res.json({ success: true });
        break;
      case 'list':
        if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Directory not found' });
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        res.json({
          files: entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
          }))
        });
        break;
      default:
        res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    log(`FILE ERROR: ${err.message}`);
    res.status(500).json({ error: isDev ? err.message : 'File operation failed' });
  }
});

// GET /logs?name=agent|llama|web|ollama|server&lines=200
// Returns last N lines of a known log file with timestamps preserved as-is.
const KNOWN_LOGS = {
  agent: 'agent.log',
  llama: 'llama.log',
  web: 'web.log',
  ollama: 'ollama.log',
  server: 'server.log',
};

app.get('/logs', (req, res) => {
  const name = String(req.query.name || '').toLowerCase();
  const maxLines = Math.min(parseInt(String(req.query.lines || '200'), 10) || 200, 2000);
  const fileName = KNOWN_LOGS[name];
  if (!fileName) {
    return res.status(400).json({ error: `Unknown log: ${name}. Allowed: ${Object.keys(KNOWN_LOGS).join(', ')}` });
  }
  const filePath = path.join(LOG_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return res.json({ name, file: fileName, exists: false, lines: [], mtime: null, size: 0 });
  }
  try {
    const stat = fs.statSync(filePath);
    // Read at most last 1MB to keep it fast
    const readSize = Math.min(stat.size, 1024 * 1024);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);
    const text = buf.toString('utf-8');
    const all = text.split(/\r?\n/);
    const lines = all.slice(-maxLines - 1, -1).length ? all.slice(-maxLines - 1, -1) : all.slice(-maxLines);
    res.json({
      name,
      file: fileName,
      exists: true,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      lines,
      truncated: stat.size > readSize,
    });
  } catch (err) {
    res.status(500).json({ error: isDev ? err.message : 'Failed to read log' });
  }
});

// GET /selftest — checks ports, model files, log dir, agent capability
app.get('/selftest', async (req, res) => {
  const checks = [];
  const pushCheck = (name, ok, message, detail) =>
    checks.push({ name, ok: !!ok, message, detail });

  // 1. Project directories
  for (const d of ['logs', 'models/gguf', 'models/ollama', '.ollama', 'public/updates', 'config', 'bin/node', 'dist']) {
    const p = path.join(PROJECT_ROOT, d);
    pushCheck(`dir:${d}`, fs.existsSync(p), fs.existsSync(p) ? 'present' : 'missing', p);
  }

  // 2a. Portable Ollama model dir (per spec: .ollama, fallback models/ollama)
  const ollamaPortable = path.join(PROJECT_ROOT, '.ollama');
  const ollamaLegacy = path.join(PROJECT_ROOT, 'models', 'ollama');
  const ollamaDir = fs.existsSync(path.join(ollamaPortable, 'models')) ? ollamaPortable :
                    fs.existsSync(path.join(ollamaLegacy, 'models')) ? ollamaLegacy : ollamaPortable;

  // 2b. GGUF models present
  const ggufDir = path.join(PROJECT_ROOT, 'models', 'gguf');
  let ggufFiles = [];
  if (fs.existsSync(ggufDir)) {
    try {
      ggufFiles = fs.readdirSync(ggufDir).filter(f => f.toLowerCase().endsWith('.gguf'));
    } catch {}
  }
  pushCheck('models:gguf', ggufFiles.length > 0,
    ggufFiles.length > 0 ? `${ggufFiles.length} model(s) found` : 'no .gguf files in models/gguf',
    ggufFiles);

  // 3. Port reachability via http
  const probeHttp = (host, port, pathName) => new Promise((resolve) => {
    const req2 = http.request({ host, port, path: pathName, method: 'GET', timeout: 1500 }, (r) => {
      resolve({ ok: r.statusCode && r.statusCode < 500, status: r.statusCode });
      r.resume();
    });
    req2.on('error', () => resolve({ ok: false, status: 0 }));
    req2.on('timeout', () => { req2.destroy(); resolve({ ok: false, status: 0 }); });
    req2.end();
  });

  const [agentProbe, webProbe, ollamaProbe, llamaProbe] = await Promise.all([
    probeHttp('127.0.0.1', PORT, '/status'),
    probeHttp('127.0.0.1', 8080, '/'),
    probeHttp('127.0.0.1', 11434, '/api/tags'),
    probeHttp('127.0.0.1', 8081, '/health'),
  ]);
  pushCheck('port:agent(3847)', agentProbe.ok, agentProbe.ok ? `responds (${agentProbe.status})` : 'unreachable');
  pushCheck('port:web(8080)', webProbe.ok, webProbe.ok ? `responds (${webProbe.status})` : 'unreachable');
  pushCheck('port:ollama(11434)', ollamaProbe.ok, ollamaProbe.ok ? `responds (${ollamaProbe.status})` : 'not running (optional)');
  pushCheck('port:llama-server(8081)', llamaProbe.ok, llamaProbe.ok ? `responds (${llamaProbe.status})` : 'not running (optional)');

  // 4. Log dir writable
  let logWriteOk = false;
  try {
    const tp = path.join(LOG_DIR, '.selftest');
    fs.writeFileSync(tp, 'ok');
    fs.unlinkSync(tp);
    logWriteOk = true;
  } catch {}
  pushCheck('logs:writable', logWriteOk, logWriteOk ? 'ok' : 'cannot write to logs/');

  const required = checks.filter(c =>
    c.name.startsWith('dir:') ||
    c.name === 'port:agent(3847)' ||
    c.name === 'logs:writable'
  );
  const passed = checks.filter(c => c.ok).length;
  const allCriticalOk = required.every(c => c.ok);

  res.json({
    ok: allCriticalOk,
    passed,
    total: checks.length,
    timestamp: new Date().toISOString(),
    projectRoot: PROJECT_ROOT,
    ollamaModelsDir: ollamaDir,
    ggufFiles,
    checks,
  });
});

// ===== Model discovery + portable Ollama helpers =====

function walkDir(root, maxDepth = 6) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth) stack.push({ dir: full, depth: depth + 1 });
      } else {
        out.push(full);
      }
    }
  }
  return out;
}

// Proxy live Ollama tags so the UI can avoid CORS surprises
app.get('/ollama/tags', (req, res) => {
  const r = http.request({ host: '127.0.0.1', port: 11434, path: '/api/tags', method: 'GET', timeout: 2000 }, (resp) => {
    let body = '';
    resp.on('data', c => { body += c; });
    resp.on('end', () => {
      res.status(resp.statusCode || 502)
         .setHeader('Content-Type', 'application/json')
         .send(body || '{"models":[]}');
    });
  });
  r.on('error', () => res.status(503).json({ error: 'Ollama not reachable', models: [] }));
  r.on('timeout', () => { r.destroy(); res.status(504).json({ error: 'Ollama timeout', models: [] }); });
  r.end();
});

// Read-only scan of portable Ollama manifests (works even if daemon is down)
app.get('/scan/ollama', (req, res) => {
  const dirs = [
    path.join(PROJECT_ROOT, '.ollama', 'models', 'manifests'),
    path.join(PROJECT_ROOT, 'models', 'ollama', 'models', 'manifests'),
  ];
  const found = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of walkDir(d, 8)) {
      // Manifest files are named after the tag, registry/library/<model>/<tag>
      const rel = path.relative(d, f).replace(/\\/g, '/');
      const parts = rel.split('/');
      if (parts.length >= 3) {
        const tag = parts[parts.length - 1];
        const name = parts[parts.length - 2];
        found.push({ name: `${name}:${tag}`, source: 'manifest', path: f });
      }
    }
  }
  res.json({ models: found, dirs: dirs.filter(d => fs.existsSync(d)) });
});

// Recursive .gguf discovery
app.get('/scan/gguf', (req, res) => {
  const root = path.join(PROJECT_ROOT, 'models', 'gguf');
  const files = walkDir(root, 8).filter(f => f.toLowerCase().endsWith('.gguf'));
  const models = files.map(f => {
    let size = 0;
    try { size = fs.statSync(f).size; } catch {}
    return {
      name: path.basename(f),
      relPath: path.relative(PROJECT_ROOT, f).replace(/\\/g, '/'),
      size,
    };
  });
  res.json({ models, root });
});

// Locate llama-server.exe anywhere under bin/llama
app.get('/scan/llama-server', (req, res) => {
  const root = path.join(PROJECT_ROOT, 'bin', 'llama');
  const candidates = walkDir(root, 6).filter(f => /llama-server(\.exe)?$/i.test(path.basename(f)));
  res.json({
    found: candidates.length > 0,
    paths: candidates.map(f => path.relative(PROJECT_ROOT, f).replace(/\\/g, '/')),
  });
});

// Persistent record of applied bundled updates (config/applied-updates.json)
const APPLIED_UPDATES_FILE = path.join(PROJECT_ROOT, 'config', 'applied-updates.json');
function readApplied() {
  try { return JSON.parse(fs.readFileSync(APPLIED_UPDATES_FILE, 'utf-8')); } catch { return { applied: [] }; }
}
function writeApplied(data) {
  try {
    fs.mkdirSync(path.dirname(APPLIED_UPDATES_FILE), { recursive: true });
    fs.writeFileSync(APPLIED_UPDATES_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch { return false; }
}
app.get('/updates/applied', (req, res) => res.json(readApplied()));
app.post('/updates/applied', (req, res) => {
  const { version } = req.body || {};
  if (!version || typeof version !== 'string') return res.status(400).json({ error: 'version required' });
  const data = readApplied();
  if (!data.applied.includes(version)) data.applied.push(version);
  data.updatedAt = new Date().toISOString();
  res.json({ ok: writeApplied(data), applied: data.applied });
});

// ===== OpenSCAD: status + render =====
const threeDState = { lastScadPath: null, lastStlPath: null, lastError: null };

function resolveOpenScadBin() {
  const candidates = [
    process.env.OPENSCAD_BIN,
    'openscad',
    'openscad.exe',
    'C:\\Program Files\\OpenSCAD\\openscad.exe',
    'C:\\Program Files (x86)\\OpenSCAD\\openscad.exe',
    '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) {
      try { if (fs.existsSync(c)) return c; } catch {}
    }
  }
  return 'openscad';
}

function probeOpenScad(cb) {
  const { execFile } = require('child_process');
  const bin = resolveOpenScadBin();
  execFile(bin, ['--version'], { timeout: 4000 }, (err, stdout, stderr) => {
    if (err) return cb({ available: false, bin, error: err.code === 'ENOENT' ? 'OpenSCAD CLI not found' : (err.message || 'unknown') });
    cb({ available: true, bin, version: (stdout || stderr || '').trim() });
  });
}

app.get('/openscad/status', (req, res) => {
  probeOpenScad((s) => {
    if (!s.available) return res.json({ available: false, error: s.error || 'OpenSCAD CLI not found' });
    res.json({ available: true, version: s.version });
  });
});

app.post('/openscad/render', (req, res) => {
  const { scad, name } = req.body || {};
  if (typeof scad !== 'string' || !scad.trim()) return res.status(400).json({ ok: false, error: 'scad required (non-empty string)' });
  const safeName = String(name || 'model').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'model';
  const outDir = path.join(process.cwd(), 'projects', '3d', safeName);
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const scadPath = path.join(outDir, 'model.scad');
  const stlPath = path.join(outDir, 'model.stl');
  const metaPath = path.join(outDir, 'metadata.json');
  try {
    fs.writeFileSync(scadPath, scad, 'utf8');
    fs.writeFileSync(metaPath, JSON.stringify({ name: safeName, createdAt: new Date().toISOString(), bytes: scad.length }, null, 2));
  } catch (e) { return res.status(500).json({ ok: false, error: 'write failed: ' + e.message }); }
  threeDState.lastScadPath = scadPath;

  probeOpenScad((s) => {
    if (!s.available) {
      threeDState.lastError = 'OpenSCAD CLI not found';
      threeDState.lastStlPath = null;
      try { if (fs.existsSync(stlPath)) fs.unlinkSync(stlPath); } catch {}
      return res.status(422).json({
        ok: false,
        error: 'OpenSCAD CLI not found. Install OpenSCAD to export STL.',
        missing: true,
        install: {
          windows: 'winget install OpenSCAD.OpenSCAD',
          macos: 'brew install --cask openscad',
          linux: 'sudo apt install openscad',
        },
      });
    }
    const { execFile } = require('child_process');
    execFile(s.bin, ['-o', stlPath, scadPath], { timeout: 60000 }, (err, _stdout, stderr) => {
      if (err) {
        threeDState.lastError = stderr || err.message;
        threeDState.lastStlPath = null;
        try { if (fs.existsSync(stlPath)) fs.unlinkSync(stlPath); } catch {}
        return res.status(500).json({ ok: false, error: stderr || err.message });
      }
      try {
        const buf = fs.readFileSync(stlPath);
        threeDState.lastStlPath = stlPath;
        threeDState.lastError = null;
        res.setHeader('Content-Type', 'application/sla');
        res.setHeader('X-Stl-Path', stlPath);
        res.send(buf);
      } catch (e) {
        threeDState.lastError = 'read failed: ' + e.message;
        res.status(500).json({ ok: false, error: 'read failed: ' + e.message });
      }
    });
  });
});
app.get('/agent/ollama-info', (req, res) => {
  const expectedDir = path.join(PROJECT_ROOT, '.ollama');
  const manifestRoot = path.join(expectedDir, 'models', 'manifests');
  let manifestCount = 0;
  try {
    if (fs.existsSync(manifestRoot)) {
      manifestCount = walkDir(manifestRoot, 8).length;
    }
  } catch {}
  const r = http.request({ host: '127.0.0.1', port: 11434, path: '/api/tags', method: 'GET', timeout: 1500 }, (resp) => {
    let body = '';
    resp.on('data', (c) => { body += c; });
    resp.on('end', () => {
      let liveCount = 0;
      try { liveCount = (JSON.parse(body).models || []).length; } catch {}
      res.json({ running: true, liveCount, manifestCount, expectedDir });
    });
  });
  r.on('error', () => res.json({ running: false, liveCount: 0, manifestCount, expectedDir }));
  r.on('timeout', () => { r.destroy(); res.json({ running: false, liveCount: 0, manifestCount, expectedDir }); });
  r.end();
});

// Alias to match documented spec: POST /3d/export-stl
app.post('/3d/export-stl', (req, res, next) => {
  req.url = '/openscad/render';
  app._router.handle(req, res, next);
});

// GET /3d/status — quick status for 3D printing mode
app.get('/3d/status', (req, res) => {
  const { execFile } = require('child_process');
  execFile('openscad', ['--version'], { timeout: 4000 }, (err, stdout, stderr) => {
    res.json({
      ok: true,
      openscadAvailable: !err,
      openscadVersion: err ? null : (stdout || stderr || '').trim(),
      lastScadPath: threeDState.lastScadPath,
      lastStlPath: threeDState.lastStlPath,
      lastError: threeDState.lastError,
      projectsDir: path.join(process.cwd(), 'projects', '3d'),
    });
  });
});

// POST /3d/save-scad — persist generated OpenSCAD without running export
app.post('/3d/save-scad', (req, res) => {
  const { scad, name } = req.body || {};
  if (typeof scad !== 'string' || !scad.trim()) return res.status(400).json({ error: 'scad required' });
  const safeName = String(name || 'model').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'model';
  const outDir = path.join(process.cwd(), 'projects', '3d', safeName);
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const scadPath = path.join(outDir, `${safeName}.scad`);
  const metaPath = path.join(outDir, 'metadata.json');
  try {
    fs.writeFileSync(scadPath, scad, 'utf8');
    fs.writeFileSync(metaPath, JSON.stringify({ name: safeName, savedAt: new Date().toISOString(), bytes: scad.length }, null, 2));
    threeDState.lastScadPath = scadPath;
    res.json({ ok: true, scadPath, dir: outDir });
  } catch (e) {
    res.status(500).json({ error: 'write failed: ' + e.message });
  }
});

// 3D diagnostics: openscad availability + last export info
app.get('/3d/diagnostics', (req, res) => {
  const { execFile } = require('child_process');
  execFile('openscad', ['--version'], { timeout: 4000 }, (err, stdout, stderr) => {
    const installInstructions = {
      windows: 'winget install OpenSCAD.OpenSCAD',
      macos: 'brew install --cask openscad',
      linux: 'sudo apt install openscad',
    };
    res.json({
      openscadAvailable: !err,
      openscadVersion: err ? null : (stdout || stderr || '').trim(),
      lastScadPath: threeDState.lastScadPath,
      lastStlPath: threeDState.lastStlPath,
      lastError: threeDState.lastError,
      projectsDir: path.join(process.cwd(), 'projects', '3d'),
      installInstructions: err ? installInstructions : null,
    });
  });
});

// Restart portable Ollama with the project's .ollama folder
app.post('/agent/restart-ollama', requireSession, (req, res) => {
  const portableBin = path.join(PROJECT_ROOT, 'bin', 'ollama', process.platform === 'win32' ? 'ollama.exe' : 'ollama');
  const ollamaBin = fs.existsSync(portableBin) ? portableBin : 'ollama';
  const modelsDir = path.join(PROJECT_ROOT, '.ollama');
  try {
    for (const [, child] of trackedProcesses) {
      try { if (child.spawnfile && /ollama/i.test(child.spawnfile)) child.kill(); } catch {}
    }
    try {
      if (process.platform === 'win32') exec('taskkill /IM ollama.exe /F', () => {});
      else exec('pkill -f ollama', () => {});
    } catch {}
    setTimeout(() => {
      try {
        const child = spawn(ollamaBin, ['serve'], {
          cwd: PROJECT_ROOT,
          env: { ...process.env, OLLAMA_MODELS: modelsDir, OLLAMA_HOST: '127.0.0.1:11434' },
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        trackProcess(child);
        res.json({ ok: true, pid: child.pid, modelsDir, bin: ollamaBin });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }, 600);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /processes
app.get('/processes', (req, res) => {
  const procs = [];
  for (const [pid, child] of trackedProcesses) {
    procs.push({ pid, killed: child.killed, exitCode: child.exitCode });
  }
  res.json({ processes: procs });
});

// POST /process/kill
app.post('/process/kill', requireSession, (req, res) => {
  const { pid } = req.body;
  const child = trackedProcesses.get(pid);
  if (!child) return res.status(404).json({ error: 'Process not found' });
  child.kill('SIGTERM');
  res.json({ success: true });
});

// ===== Hardware scan =====
const os = require('os');

let cpuPrev = os.cpus().map(c => ({ ...c.times }));
function cpuPercent() {
  const cur = os.cpus().map(c => ({ ...c.times }));
  let idle = 0, total = 0;
  for (let i = 0; i < cur.length; i++) {
    const a = cpuPrev[i] || cur[i];
    const b = cur[i];
    const di = b.idle - a.idle;
    const dt = (b.user + b.nice + b.sys + b.idle + b.irq) - (a.user + a.nice + a.sys + a.idle + a.irq);
    idle += di; total += dt;
  }
  cpuPrev = cur;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
}

let cachedGpu = null;
function detectGpu(cb) {
  if (cachedGpu !== null) return cb(cachedGpu);
  const cmd = process.platform === 'win32'
    ? 'wmic path win32_VideoController get name'
    : 'lspci | grep -i vga';
  exec(cmd, { timeout: 2500 }, (err, stdout) => {
    if (err || !stdout) { cachedGpu = ''; return cb(''); }
    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^name$/i.test(l));
    cachedGpu = lines[0] || '';
    cb(cachedGpu);
  });
}

let cachedDisk = null;
let cachedDiskAt = 0;
function detectDisk(cb) {
  const now = Date.now();
  if (cachedDisk && now - cachedDiskAt < 5000) return cb(cachedDisk);
  const finish = (d) => { cachedDisk = d; cachedDiskAt = now; cb(d); };
  try {
    if (process.platform === 'win32') {
      const drive = (PROJECT_ROOT.match(/^([A-Za-z]):/) || [, 'C'])[1];
      exec(`wmic logicaldisk where "DeviceID='${drive}:'" get FreeSpace,Size /value`,
        { timeout: 3000 }, (err, stdout) => {
          if (err || !stdout) return finish({ available: false });
          const free = Number((stdout.match(/FreeSpace=(\d+)/) || [])[1]) || 0;
          const size = Number((stdout.match(/Size=(\d+)/) || [])[1]) || 0;
          if (!size) return finish({ available: false });
          finish({
            available: true, mount: `${drive}:\\`,
            diskTotalBytes: size, diskFreeBytes: free,
            diskUsedBytes: size - free,
            diskPercent: Math.round(((size - free) / size) * 100),
          });
        });
    } else {
      exec(`df -kP "${PROJECT_ROOT}"`, { timeout: 3000 }, (err, stdout) => {
        if (err || !stdout) return finish({ available: false });
        const lines = stdout.trim().split(/\n/);
        const last = lines[lines.length - 1].split(/\s+/);
        const total = Number(last[1]) * 1024;
        const used = Number(last[2]) * 1024;
        const avail = Number(last[3]) * 1024;
        if (!total) return finish({ available: false });
        finish({
          available: true, mount: last[5] || '/',
          diskTotalBytes: total, diskFreeBytes: avail, diskUsedBytes: used,
          diskPercent: Math.round((used / total) * 100),
        });
      });
    }
  } catch { finish({ available: false }); }
}

function hardwareSnapshot(cb) {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const snap = {
    cpuPercent: cpuPercent(),
    cpuModel: (os.cpus()[0] && os.cpus()[0].model) || 'Unknown',
    cpuCores: os.cpus().length,
    totalMemBytes: totalMem,
    usedMemBytes: usedMem,
    memPercent: Math.round((usedMem / totalMem) * 100),
    platform: process.platform,
    arch: process.arch,
    uptimeSec: Math.round(os.uptime()),
    loadAvg: os.loadavg(),
    timestamp: new Date().toISOString(),
  };
  detectGpu((gpu) => {
    snap.gpu = gpu;
    detectDisk((disk) => { snap.disk = disk; cb(snap); });
  });
}

app.get('/scan/hardware', (req, res) => {
  hardwareSnapshot((snap) => res.json(snap));
});

// Server-Sent Events stream of hardware metrics, 1Hz.
app.get('/scan/hardware/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  let alive = true;
  const tick = () => {
    if (!alive) return;
    hardwareSnapshot((snap) => {
      if (!alive) return;
      try { res.write(`data: ${JSON.stringify(snap)}\n\n`); } catch { alive = false; }
    });
  };
  tick();
  const iv = setInterval(tick, 1000);
  req.on('close', () => { alive = false; clearInterval(iv); try { res.end(); } catch {} });
});

// ===== Debug endpoints =====
let lastErrorRecord = null;
function recordError(source, err) {
  lastErrorRecord = {
    source,
    message: (err && (err.message || String(err))) || 'Unknown error',
    stack: err && err.stack ? String(err.stack).split('\n').slice(0, 8).join('\n') : null,
    at: new Date().toISOString(),
  };
}
process.on('uncaughtException', (e) => { recordError('uncaughtException', e); log(`UNCAUGHT: ${e.stack || e}`); });
process.on('unhandledRejection', (e) => { recordError('unhandledRejection', e); log(`UNHANDLED: ${e && e.stack || e}`); });

app.get('/debug/snapshot', (req, res) => {
  hardwareSnapshot((hw) => {
    let pkgVersion = '0.0.0';
    try { pkgVersion = require(path.join(PROJECT_ROOT, 'package.json')).version || pkgVersion; } catch {}
    res.json({
      ok: true,
      at: new Date().toISOString(),
      agent: { up: true, port: PORT, sessionToken: SESSION_TOKEN, uptimeSec: Math.round(process.uptime()), version: pkgVersion },
      preview: previewState(),
      lastError: lastErrorRecord,
      hardware: hw,
      processes: Array.from(trackedProcesses.keys()),
      projectRoot: PROJECT_ROOT,
    });
  });
});

app.get('/debug/bundle', (req, res) => {
  hardwareSnapshot((hw) => {
    const bundle = {
      generatedAt: new Date().toISOString(),
      projectRoot: PROJECT_ROOT,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      hardware: hw,
      preview: previewState(),
      lastError: lastErrorRecord,
      logs: {},
    };
    for (const [name, file] of Object.entries(KNOWN_LOGS)) {
      const fp = path.join(LOG_DIR, file);
      if (!fs.existsSync(fp)) { bundle.logs[name] = null; continue; }
      try {
        const stat = fs.statSync(fp);
        const readSize = Math.min(stat.size, 64 * 1024);
        const fd = fs.openSync(fp, 'r');
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
        fs.closeSync(fd);
        bundle.logs[name] = buf.toString('utf-8').split(/\r?\n/).slice(-200);
      } catch (e) {
        bundle.logs[name] = [`<read failed: ${e.message}>`];
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="debug-bundle-${Date.now()}.json"`);
    res.send(JSON.stringify(bundle, null, 2));
  });
});

// ===== Live Preview / Dev-server orchestration =====
// Manages an isolated preview workspace under .preview-workspace/session-<ts>
// We DO NOT delete previous sessions while a server may still hold file handles —
// this avoids EPERM on Windows. Old sessions are pruned only when no process is
// known to be alive, and even then we tolerate failure.
const PREVIEW_ROOT = path.join(PROJECT_ROOT, '.preview-workspace');
let previewProc = null;
let previewMeta = { status: 'idle', port: 0, sessionDir: null, startedAt: null, lastError: null, pid: null };

function previewState() {
  return {
    status: previewMeta.status,
    port: previewMeta.port,
    url: previewMeta.port ? `http://127.0.0.1:${previewMeta.port}` : null,
    sessionDir: previewMeta.sessionDir ? path.relative(PROJECT_ROOT, previewMeta.sessionDir).replace(/\\/g, '/') : null,
    startedAt: previewMeta.startedAt,
    pid: previewMeta.pid,
    lastError: previewMeta.lastError,
  };
}

function pickPort(start = 5180) {
  return new Promise((resolve) => {
    const net = require('net');
    const tryPort = (p) => {
      if (p > start + 200) return resolve(0);
      const srv = net.createServer();
      srv.once('error', () => tryPort(p + 1));
      srv.once('listening', () => srv.close(() => resolve(p)));
      srv.listen(p, '127.0.0.1');
    };
    tryPort(start);
  });
}

function ensurePreviewWorkspace(sessionId, files) {
  if (!fs.existsSync(PREVIEW_ROOT)) fs.mkdirSync(PREVIEW_ROOT, { recursive: true });
  const sessionDir = path.join(PREVIEW_ROOT, `session-${sessionId}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  // Minimal Vite scaffold — only write missing files so re-runs are cheap.
  const writeIfMissing = (rel, content) => {
    const fp = path.join(sessionDir, rel);
    if (fs.existsSync(fp)) return;
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content);
  };

  writeIfMissing('package.json', JSON.stringify({
    name: `preview-${sessionId}`,
    private: true,
    type: 'module',
    scripts: { dev: 'vite' },
  }, null, 2));

  writeIfMissing('index.html', `<!doctype html><html><head><meta charset="utf-8"/><title>Preview</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);

  writeIfMissing('vite.config.ts',
`import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { host: '127.0.0.1', strictPort: true },
});`);

  writeIfMissing('src/main.tsx',
`import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
createRoot(document.getElementById('root')!).render(<App />);`);

  writeIfMissing('src/App.tsx',
`export default function App(){ return <div style={{fontFamily:'sans-serif',padding:24}}><h1>Preview ready</h1><p>Generated files will appear here.</p></div>; }`);

  // Write/overwrite caller-supplied files
  if (Array.isArray(files)) {
    for (const f of files) {
      if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') continue;
      const safeRel = f.path.replace(/^[/\\]+/, '').replace(/\.\.[\\/]/g, '');
      const fp = path.join(sessionDir, safeRel);
      if (!fp.startsWith(sessionDir)) continue;
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, f.content);
    }
  }
  return sessionDir;
}

function stopPreviewProc() {
  if (!previewProc) return;
  try { previewProc.kill('SIGTERM'); } catch {}
  try {
    if (process.platform === 'win32' && previewProc.pid) {
      exec(`taskkill /PID ${previewProc.pid} /T /F`, () => {});
    }
  } catch {}
  previewProc = null;
}

app.get('/dev-server/status', (req, res) => res.json(previewState()));

app.post('/dev-server/start', requireSession, async (req, res) => {
  try {
    const { files, sessionId } = req.body || {};
    const sid = sessionId || String(Date.now());
    const sessionDir = ensurePreviewWorkspace(sid, files);
    if (previewProc) stopPreviewProc();

    const port = await pickPort(5180);
    if (!port) {
      previewMeta = { ...previewMeta, status: 'error', lastError: 'No free port', port: 0 };
      return res.status(500).json({ error: 'No free port available' });
    }

    // Reuse host node_modules via NODE_PATH so we don't reinstall per-session.
    const nodeModules = path.join(PROJECT_ROOT, 'node_modules');
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    previewMeta = { status: 'starting', port, sessionDir, startedAt: new Date().toISOString(), lastError: null, pid: null };

    const child = spawn(npx, ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: sessionDir,
      env: { ...process.env, NODE_PATH: nodeModules, FORCE_COLOR: '0' },
      shell: process.platform === 'win32',
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    previewProc = child;
    previewMeta.pid = child.pid;
    trackProcess(child);

    const onLine = (chunk, kind) => {
      const text = chunk.toString();
      try { fs.appendFileSync(path.join(LOG_DIR, 'preview.log'), text); } catch {}
      if (/Local:\s+http/i.test(text) || /ready in /i.test(text)) {
        previewMeta.status = 'live';
      }
      if (kind === 'stderr' && /error/i.test(text)) {
        previewMeta.lastError = text.trim().slice(-500);
      }
    };
    child.stdout.on('data', (c) => onLine(c, 'stdout'));
    child.stderr.on('data', (c) => onLine(c, 'stderr'));
    child.on('exit', (code) => {
      if (previewMeta.status !== 'idle') {
        previewMeta.status = code === 0 ? 'idle' : 'error';
        previewMeta.lastError = previewMeta.lastError || `Vite exited with code ${code}`;
        previewMeta.port = 0;
      }
      if (previewProc === child) previewProc = null;
    });

    // Optimistically wait up to 8s for "live"
    const started = Date.now();
    const wait = setInterval(() => {
      if (previewMeta.status === 'live' || Date.now() - started > 8000 || previewMeta.status === 'error') {
        clearInterval(wait);
        res.json(previewState());
      }
    }, 200);
  } catch (err) {
    recordError('dev-server/start', err);
    previewMeta = { ...previewMeta, status: 'error', lastError: err.message };
    res.status(500).json({ error: err.message });
  }
});

app.post('/dev-server/stop', requireSession, (req, res) => {
  stopPreviewProc();
  previewMeta = { status: 'idle', port: 0, sessionDir: previewMeta.sessionDir, startedAt: null, lastError: null, pid: null };
  res.json(previewState());
});

// Express error middleware
app.use((err, req, res, next) => {
  recordError('express', err);
  log(`ERROR: ${err.stack || err.message}`);
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
  });
});

// ===== WebSocket =====
if (WebSocket) {
  const wss = new WebSocket.Server({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    wsClients.add(ws);
    log('WebSocket client connected');
    ws.on('close', () => {
      wsClients.delete(ws);
      log('WebSocket client disconnected');
    });
    ws.on('error', () => wsClients.delete(ws));
  });
}

// ===== Graceful Shutdown =====
function shutdown() {
  log('Shutting down — killing tracked processes...');
  for (const [pid, child] of trackedProcesses) {
    try { child.kill('SIGTERM'); } catch {}
  }
  for (const ws of wsClients) {
    try { ws.close(); } catch {}
  }
  wsClients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ===== Start =====
server.listen(PORT, () => {
  log(`LocalDev AI Agent Server running on port ${PORT} (${NODE_ENV})`);
  log(`Session token: ${SESSION_TOKEN}`);
  console.log(`\n  🤖 Agent server: http://localhost:${PORT}`);
  console.log(`  🔑 Session token: ${SESSION_TOKEN}\n`);
});
