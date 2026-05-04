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
    agentLog, webLog, llamaLog, ollamaLog, serverLog,
  ] = await Promise.all([
    get('/status'),
    get('/selftest', 6000),
    get('/debug/snapshot'),
    get('/dev-server/status'),
    get('/agent/ollama-info'),
    get('/updates/applied'),
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
