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

// Snapshot of Ollama state — used by UI to detect "wrong model folder" mismatch
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

// Express error middleware
app.use((err, req, res, next) => {
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
