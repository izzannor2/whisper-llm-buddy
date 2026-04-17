// Model discovery helpers for each supported provider.
async function fetchJson(url: string, init?: RequestInit, timeoutMs = 4000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchOllamaModels(url: string): Promise<string[]> {
  const data = await fetchJson(`${url.replace(/\/$/, '')}/api/tags`);
  return (data.models || []).map((m: any) => m.name).filter(Boolean);
}

export async function fetchLlamaModels(url: string): Promise<string[]> {
  const data = await fetchJson(`${url.replace(/\/$/, '')}/v1/models`);
  return (data.data || []).map((m: any) => m.id).filter(Boolean);
}

export async function fetchAgentModels(url: string): Promise<string[]> {
  try {
    const data = await fetchJson(`${url.replace(/\/$/, '')}/models`);
    if (Array.isArray(data)) return data.map((m: any) => m.id || m.name).filter(Boolean);
    if (Array.isArray(data?.models)) return data.models.map((m: any) => m.id || m.name).filter(Boolean);
  } catch {}
  return [];
}

export async function fetchRemoteModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const data = await fetchJson(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  return (data.data || []).map((m: any) => m.id).filter(Boolean);
}

export type ConnectionResult = { ok: boolean; error?: string; models?: string[] };

export async function testConnection(
  provider: 'localAgent' | 'llama' | 'ollama' | 'remote',
  cfg: { url?: string; baseUrl?: string; apiKey?: string },
): Promise<ConnectionResult> {
  try {
    let models: string[] = [];
    if (provider === 'ollama') models = await fetchOllamaModels(cfg.url || '');
    else if (provider === 'llama') models = await fetchLlamaModels(cfg.url || '');
    else if (provider === 'localAgent') models = await fetchAgentModels(cfg.url || '');
    else if (provider === 'remote') models = await fetchRemoteModels(cfg.baseUrl || '', cfg.apiKey || '');
    return { ok: true, models };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Connection failed' };
  }
}
