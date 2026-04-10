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
const SESSION_TOKEN = crypto.randomHex ? crypto.randomBytes(16).toString('hex') : crypto.randomBytes(16).toString('hex');

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
