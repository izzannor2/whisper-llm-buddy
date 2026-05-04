/**
 * Diagnostic bundle generator.
 *
 * Hits a fixed set of agent endpoints (all real — no fake fallbacks) and
 * returns a single JSON object that can be copied or saved. Each entry is
 * tagged with status: 'ok' | 'missing' | 'error' so the UI can render it
 * cleanly without inventing data.
 */
import { getModelRegistry } from './model-registry';
import { loadRouting, loadToggles } from './model-routing';
import { getCurrentVersion, getUpdateHistory } from './update-system';
import { getBuffer } from './error-bus';

export interface BundleEntry<T = unknown> {
  status: 'ok' | 'missing' | 'error' | 'offline';
  url?: string;
  data?: T;
  error?: string;
  ms?: number;
}

const AGENT = 'http://127.0.0.1:3847';

async function get<T = unknown>(path: string, ms = 3000): Promise<BundleEntry<T>> {
  const url = `${AGENT}${path}`;
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const took = Date.now() - started;
    if (r.status === 404) return { status: 'missing', url, error: 'endpoint not found (404)', ms: took };
    if (!r.ok) return { status: 'error', url, error: `HTTP ${r.status}`, ms: took };
    let data: any;
    try { data = await r.json(); } catch { data = await r.text(); }
    return { status: 'ok', url, data, ms: took };
  } catch (e: any) {
    return { status: 'offline', url, error: e?.message || String(e), ms: Date.now() - started };
  }
}

export interface DiagnosticBundle {
  generatedAt: string;
  appVersion: string;
  userAgent: string;
  status: BundleEntry;
  selftest: BundleEntry;
  debugSnapshot: BundleEntry;
  devServerStatus: BundleEntry;
  ollamaInfo: BundleEntry;
  updatesApplied: BundleEntry;
  modelRegistry: BundleEntry;
  threeD: BundleEntry;
  routing: { roles: ReturnType<typeof loadRouting>; toggles: ReturnType<typeof loadToggles> };
  updateHistory: ReturnType<typeof getUpdateHistory>;
  recentLogs: Record<'agent' | 'web' | 'llama' | 'ollama' | 'server', BundleEntry>;
  recentErrors: ReturnType<typeof getBuffer>;
}

export async function buildBundle(): Promise<DiagnosticBundle> {
  const [
    status,
    selftest,
    debugSnapshot,
    devServerStatus,
    ollamaInfo,
    updatesApplied,
    threeD,
    agentLog, webLog, llamaLog, ollamaLog, serverLog,
  ] = await Promise.all([
    get('/status'),
    get('/selftest', 6000),
    get('/debug/snapshot'),
    get('/dev-server/status'),
    get('/agent/ollama-info'),
    get('/updates/applied'),
    get('/3d/diagnostics'),
    get('/logs?name=agent&lines=200'),
    get('/logs?name=web&lines=200'),
    get('/logs?name=llama&lines=200'),
    get('/logs?name=ollama&lines=200'),
    get('/logs?name=server&lines=200'),
  ]);

  let registry: BundleEntry;
  try {
    const snap = await getModelRegistry(true);
    registry = { status: 'ok', data: snap };
  } catch (e: any) {
    registry = { status: 'error', error: e?.message || String(e) };
  }

  return {
    generatedAt: new Date().toISOString(),
    appVersion: getCurrentVersion(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
    status,
    selftest,
    debugSnapshot,
    devServerStatus,
    ollamaInfo,
    updatesApplied,
    modelRegistry: registry,
    routing: { roles: loadRouting(), toggles: loadToggles() },
    updateHistory: getUpdateHistory(),
    recentLogs: { agent: agentLog, web: webLog, llama: llamaLog, ollama: ollamaLog, server: serverLog },
    recentErrors: getBuffer(),
  };
}

export function downloadBundle(b: DiagnosticBundle) {
  const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diagnostic-bundle-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyBundle(b: DiagnosticBundle) {
  await navigator.clipboard.writeText(JSON.stringify(b, null, 2));
}

/**
 * Plain-text "Full Support Report" — paste-friendly for ChatGPT/issues.
 * Includes diagnostic bundle, recent error bus entries, launcher
 * instructions, app version, browser URL, model routing, update history.
 */
export function buildSupportReport(b: DiagnosticBundle): string {
  const lines: string[] = [];
  const url = typeof window !== 'undefined' ? window.location.href : 'n/a';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a';
  const lsVersion = (() => {
    try { return typeof localStorage !== 'undefined' ? (localStorage.getItem('localdev-app-version') || '(unset)') : 'n/a'; }
    catch { return 'n/a'; }
  })();
  const lastPreviewError = [...b.recentErrors].reverse().find(e => e.source === 'preview');
  const lastUpdateError = [...b.recentErrors].reverse().find(e => e.source === 'update');
  const launcher = [
    'Launcher: RUN-ALL.bat (single source of truth).',
    'start.bat and START-PORTABLE-AI.bat must call RUN-ALL.bat.',
    'Backend agent must listen on http://127.0.0.1:3847.',
  ].join('\n');

  lines.push('=== FULL SUPPORT REPORT ===');
  lines.push('Paste this into ChatGPT (or attach to a GitHub issue) for help debugging.');
  lines.push('');
  lines.push(`Generated: ${b.generatedAt}`);
  lines.push(`App version (bundle): ${b.appVersion}`);
  lines.push(`App version (localStorage): ${lsVersion}`);
  lines.push(`Browser URL: ${url}`);
  lines.push(`User agent: ${ua}`);
  lines.push('');
  lines.push('--- Launcher instructions ---');
  lines.push(launcher);
  lines.push('');
  lines.push('--- Endpoint health ---');
  for (const [k, v] of [
    ['/status', b.status], ['/selftest', b.selftest], ['/debug/snapshot', b.debugSnapshot],
    ['/dev-server/status', b.devServerStatus], ['/agent/ollama-info', b.ollamaInfo],
    ['/updates/applied', b.updatesApplied],
  ] as const) {
    lines.push(`${k}: ${(v as any).status}${(v as any).ms != null ? ` (${(v as any).ms}ms)` : ''}${(v as any).error ? ` — ${(v as any).error}` : ''}`);
  }
  lines.push('');
  lines.push('--- Selected model routing ---');
  lines.push(JSON.stringify(b.routing, null, 2));
  lines.push('');
  lines.push('--- Last preview error ---');
  lines.push(lastPreviewError ? `[${new Date(lastPreviewError.timestamp).toISOString()}] ${lastPreviewError.message}` : '(none)');
  lines.push('');
  lines.push('--- Last update error ---');
  lines.push(lastUpdateError ? `[${new Date(lastUpdateError.timestamp).toISOString()}] ${lastUpdateError.message}` : '(none)');
  lines.push('');
  lines.push('--- Update history ---');
  if (!b.updateHistory.length) lines.push('(empty)');
  else for (const h of b.updateHistory) lines.push(`${h.version} · ${new Date(h.appliedAt).toISOString()} · ${h.patchCount} patches · ${h.source || 'online'} · ${h.description}`);
  lines.push('');
  lines.push('--- Top 20 recent errors (error bus) ---');
  if (!b.recentErrors.length) lines.push('(empty)');
  else for (const e of b.recentErrors.slice(-20).reverse()) lines.push(`[${new Date(e.timestamp).toISOString()}] ${e.level.toUpperCase()} ${e.source}: ${e.message}`);
  lines.push('');
  lines.push('--- Instructions ---');
  lines.push('Paste this into ChatGPT and ask: "What is broken and how do I fix it?"');
  lines.push('');
  lines.push('--- Full diagnostic bundle (JSON) ---');
  lines.push(JSON.stringify(b, null, 2));
  return lines.join('\n');
}

export async function copySupportReport(b: DiagnosticBundle) {
  await navigator.clipboard.writeText(buildSupportReport(b));
}
