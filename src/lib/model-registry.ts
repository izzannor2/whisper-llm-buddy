/**
 * Central, real model discovery. Single source of truth for every UI surface.
 *
 * Resolution order:
 *   1. Live Ollama at http://127.0.0.1:11434/api/tags
 *   2. Agent proxy   at http://127.0.0.1:3847/ollama/tags  (same data, no CORS surprises)
 *   3. Read-only manifest scan via http://127.0.0.1:3847/scan/ollama
 *   4. Recursive .gguf scan via http://127.0.0.1:3847/scan/gguf
 *
 * Never returns hardcoded models. Caches results for 10s and broadcasts a
 * 'models-changed' window event so subscribers can re-render.
 */

export interface DiscoveredModel {
  id: string;                       // unique key, e.g. "ollama:llama3.2:3b" or "gguf:Qwen-7B-Q4.gguf"
  name: string;                     // display name
  provider: 'ollama' | 'gguf' | 'cloud';
  source: 'live' | 'agent-proxy' | 'manifest-scan' | 'gguf-scan' | 'cloud';
  size?: number;
  relPath?: string;                 // for gguf
  modifiedAt?: string;
}

export interface ModelRegistrySnapshot {
  ollama: DiscoveredModel[];
  gguf: DiscoveredModel[];
  cloud: DiscoveredModel[];
  ollamaSource: 'live' | 'agent-proxy' | 'manifest-scan' | 'none';
  ggufSource: 'gguf-scan' | 'none';
  errors: string[];
  fetchedAt: number;
}

const AGENT_BASE = 'http://127.0.0.1:3847';
const OLLAMA_BASE = 'http://127.0.0.1:11434';
const CACHE_MS = 10_000;

let cache: ModelRegistrySnapshot | null = null;
let inflight: Promise<ModelRegistrySnapshot> | null = null;

async function fetchTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function discoverOllama(errors: string[]): Promise<{ models: DiscoveredModel[]; src: ModelRegistrySnapshot['ollamaSource'] }> {
  // 1. live
  try {
    const r = await fetchTimeout(`${OLLAMA_BASE}/api/tags`, 1500);
    if (r.ok) {
      const data = await r.json();
      const models = (data.models || []).map((m: any) => ({
        id: `ollama:${m.name}`,
        name: m.name,
        provider: 'ollama' as const,
        source: 'live' as const,
        size: m.size,
        modifiedAt: m.modified_at,
      }));
      return { models, src: 'live' };
    }
  } catch (e: any) {
    errors.push(`ollama live: ${e?.message || e}`);
  }
  // 2. agent proxy
  try {
    const r = await fetchTimeout(`${AGENT_BASE}/ollama/tags`, 1500);
    if (r.ok) {
      const data = await r.json();
      const models = (data.models || []).map((m: any) => ({
        id: `ollama:${m.name}`,
        name: m.name,
        provider: 'ollama' as const,
        source: 'agent-proxy' as const,
        size: m.size,
        modifiedAt: m.modified_at,
      }));
      if (models.length > 0) return { models, src: 'agent-proxy' };
    }
  } catch (e: any) {
    errors.push(`ollama agent-proxy: ${e?.message || e}`);
  }
  // 3. read-only manifest scan
  try {
    const r = await fetchTimeout(`${AGENT_BASE}/scan/ollama`, 1500);
    if (r.ok) {
      const data = await r.json();
      const models = (data.models || []).map((m: any) => ({
        id: `ollama:${m.name}`,
        name: m.name,
        provider: 'ollama' as const,
        source: 'manifest-scan' as const,
      }));
      return { models, src: models.length ? 'manifest-scan' : 'none' };
    }
  } catch (e: any) {
    errors.push(`ollama scan: ${e?.message || e}`);
  }
  return { models: [], src: 'none' };
}

async function discoverGguf(errors: string[]): Promise<{ models: DiscoveredModel[]; src: ModelRegistrySnapshot['ggufSource'] }> {
  try {
    const r = await fetchTimeout(`${AGENT_BASE}/scan/gguf`, 1500);
    if (r.ok) {
      const data = await r.json();
      const models = (data.models || []).map((m: any) => ({
        id: `gguf:${m.relPath}`,
        name: m.name,
        provider: 'gguf' as const,
        source: 'gguf-scan' as const,
        size: m.size,
        relPath: m.relPath,
      }));
      return { models, src: models.length ? 'gguf-scan' : 'none' };
    }
  } catch (e: any) {
    errors.push(`gguf scan: ${e?.message || e}`);
  }
  return { models: [], src: 'none' };
}

export async function getModelRegistry(force = false): Promise<ModelRegistrySnapshot> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const errors: string[] = [];
    const [ollama, gguf] = await Promise.all([discoverOllama(errors), discoverGguf(errors)]);
    const snapshot: ModelRegistrySnapshot = {
      ollama: ollama.models,
      gguf: gguf.models,
      cloud: [], // cloud models live in chat-api CLOUD_MODELS; routing UI imports them separately.
      ollamaSource: ollama.src,
      ggufSource: gguf.src,
      errors,
      fetchedAt: Date.now(),
    };
    cache = snapshot;
    try { window.dispatchEvent(new CustomEvent('models-changed', { detail: snapshot })); } catch {}
    return snapshot;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function getCachedRegistry(): ModelRegistrySnapshot | null {
  return cache;
}

export function subscribeRegistry(cb: (snap: ModelRegistrySnapshot) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent).detail as ModelRegistrySnapshot);
  window.addEventListener('models-changed', handler);
  return () => window.removeEventListener('models-changed', handler);
}

/** Convenience: have we detected ANY local model from any source? */
export function hasAnyLocalModel(snap: ModelRegistrySnapshot | null): boolean {
  if (!snap) return false;
  return snap.ollama.length + snap.gguf.length > 0;
}
