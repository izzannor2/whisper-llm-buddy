#!/usr/bin/env node
/**
 * Whole-app route smoke test.
 *
 * Builds the app then probes a list of SPA routes against `vite preview`.
 * Because the app is a SPA, the dev server returns index.html for any
 * unknown route — we therefore check that:
 *   - HTTP 200
 *   - body is non-empty
 *   - body contains the root <div id="root"> mount node
 *
 * This catches catastrophic build/serve failures, not React render errors.
 */
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const ROUTES = ['/', '/models', '/ide', '/settings', '/improve', '/iot', '/sandbox'];
const PORT = process.env.SMOKE_PORT || 4180;
const HOST = `http://127.0.0.1:${PORT}`;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  console.log('[smoke] vite build…');
  await run('npx', ['vite', 'build']);

  console.log(`[smoke] vite preview on :${PORT}…`);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  server.stdout.on('data', d => process.stdout.write(`[preview] ${d}`));
  server.stderr.on('data', d => process.stderr.write(`[preview!] ${d}`));

  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    try {
      const r = await fetch(HOST + '/', { signal: AbortSignal.timeout(1000) });
      if (r.ok) ready = true;
    } catch { /* retry */ }
    if (!ready) await wait(500);
  }
  if (!ready) { server.kill(); throw new Error('preview server never responded'); }

  let failed = 0;
  for (const route of ROUTES) {
    try {
      const r = await fetch(HOST + route, { signal: AbortSignal.timeout(5000) });
      const txt = await r.text();
      const ok = r.ok && txt.length > 100 && /<div\s+id="root"/i.test(txt);
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${route}  (${r.status}, ${txt.length}B)`);
      if (!ok) failed++;
    } catch (e) {
      console.log(`  FAIL  ${route}  — ${e.message}`);
      failed++;
    }
  }

  server.kill();
  console.log(failed === 0 ? `[smoke] all ${ROUTES.length} routes passed` : `[smoke] ${failed} route(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error('[smoke] error:', e); process.exit(1); });
