// STL export via local agent (port 3847) running OpenSCAD CLI
const AGENT = 'http://127.0.0.1:3847';

export interface OpenScadStatus {
  available: boolean;
  version?: string;
  error?: string;
}

export async function getOpenScadStatus(): Promise<OpenScadStatus> {
  try {
    const r = await fetch(`${AGENT}/openscad/status`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { available: false, error: `Agent HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message : 'Agent offline' };
  }
}

export async function renderStl(scad: string, name: string): Promise<{ ok: boolean; stl?: ArrayBuffer; error?: string }> {
  try {
    const r = await fetch(`${AGENT}/openscad/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scad, name }),
    });
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, error: text };
    }
    const stl = await r.arrayBuffer();
    return { ok: true, stl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Request failed' };
  }
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
