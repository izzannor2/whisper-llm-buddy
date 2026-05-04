// STL export via local agent (port 3847) running OpenSCAD CLI
const AGENT = 'http://127.0.0.1:3847';

export interface OpenScadStatus {
  available: boolean;
  version?: string;
  error?: string;
}

const OFFLINE_MSG = 'Local agent is offline. Start RUN-ALL.bat.';

export async function getOpenScadStatus(): Promise<OpenScadStatus> {
  try {
    const r = await fetch(`${AGENT}/openscad/status`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { available: false, error: `Agent HTTP ${r.status}` };
    return await r.json();
  } catch {
    return { available: false, error: OFFLINE_MSG };
  }
}

export async function get3DStatus(): Promise<{ ok: boolean; openscadAvailable?: boolean; openscadVersion?: string | null; lastScadPath?: string | null; lastStlPath?: string | null; lastError?: string | null; error?: string }> {
  try {
    const r = await fetch(`${AGENT}/3d/status`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { ok: false, error: `Agent HTTP ${r.status}` };
    return await r.json();
  } catch {
    return { ok: false, error: OFFLINE_MSG };
  }
}

export async function saveScad(scad: string, name: string): Promise<{ ok: boolean; scadPath?: string; error?: string }> {
  try {
    const r = await fetch(`${AGENT}/3d/save-scad`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scad, name }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.error || `HTTP ${r.status}` };
    return { ok: true, scadPath: data.scadPath };
  } catch {
    return { ok: false, error: OFFLINE_MSG };
  }
}

export async function renderStl(scad: string, name: string): Promise<{ ok: boolean; stl?: ArrayBuffer; error?: string; missing?: boolean }> {
  let r: Response;
  try {
    r = await fetch(`${AGENT}/openscad/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scad, name }),
    });
  } catch {
    return { ok: false, error: 'Local agent is offline. Start RUN-ALL.bat.' };
  }
  const ctype = r.headers.get('content-type') || '';
  if (!r.ok) {
    if (ctype.includes('application/json')) {
      const data = await r.json().catch(() => ({}));
      const msg = data.missing
        ? 'OpenSCAD CLI not installed. Install OpenSCAD to export STL.'
        : (data.error || `HTTP ${r.status}`);
      return { ok: false, missing: !!data.missing, error: msg };
    }
    const text = await r.text().catch(() => '');
    return { ok: false, error: text || `HTTP ${r.status}` };
  }
  // Guard: success must be binary STL, never JSON
  if (ctype.includes('application/json')) {
    const data = await r.json().catch(() => ({}));
    return { ok: false, error: data.error || 'Unexpected JSON response from render' };
  }
  const stl = await r.arrayBuffer();
  if (!stl || stl.byteLength === 0) return { ok: false, error: 'Empty STL response' };
  return { ok: true, stl };
}

export function downloadBlob(data: BlobPart, filename: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
