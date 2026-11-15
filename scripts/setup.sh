#!/usr/bin/env bash
# Dependency setup only; never starts services or downloads models.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -x "$ROOT/bin/node/bin/node" ]; then export PATH="$ROOT/bin/node/bin:$PATH"; fi
command -v node >/dev/null || { echo "Node 20 LTS missing. Install it first."; exit 1; }
command -v npm >/dev/null || { echo "npm missing. Repair your Node installation."; exit 1; }
case "$(node --version)" in v20.*) ;; *) echo "Node 20 LTS required; found $(node --version)"; exit 1;; esac
mkdir -p logs config .ollama models/gguf bin/node bin/ollama bin/llama projects/3d public/updates
node - <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const lock = fs.existsSync('package-lock.json') ? 'package-lock.json' : 'package.json';
const hash = crypto.createHash('sha256').update(fs.readFileSync(lock)).digest('hex');
const stamp = 'node_modules/.hub-unix-install-stamp';
const required = ['react/package.json','react-dom/package.json','vite/bin/vite.js','express/package.json','ws/package.json'];
const ready = required.every(p => fs.existsSync('node_modules/' + p));
if (!ready || !fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8').trim() !== hash) {
  if (process.env.HUB_OFFLINE === '1') {
    if (!ready) { console.error('Offline dependencies missing; run setup with internet first.'); process.exit(1); }
    console.log('Offline: skipping install; dependency stamp unverified.');
  } else {
    const result = cp.spawnSync('npm', [lock === 'package-lock.json' ? 'ci' : 'install'], {stdio:'inherit'});
    if (result.status !== 0) process.exit(result.status || 1);
    fs.writeFileSync(stamp, hash);
  }
} else console.log('Dependencies match lockfile.');
NODE
echo "Setup ready. Start with: bash start.sh. Models must be added manually."
