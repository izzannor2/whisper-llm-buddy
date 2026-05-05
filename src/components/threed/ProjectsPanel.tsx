import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, FolderOpen } from 'lucide-react';

const AGENT = 'http://127.0.0.1:3847';

interface Project {
  name: string;
  hasScad: boolean;
  hasStl: boolean;
  hasPreview: boolean;
  stlBytes: number;
  scadBytes: number;
  metadata: any;
}

interface Props {
  onLoad: (name: string, scad: string) => void;
  reloadKey?: number;
}

export function ProjectsPanel({ onLoad, reloadKey }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${AGENT}/3d/projects`, { signal: AbortSignal.timeout(3000) });
      const j = await r.json();
      if (j.ok) setProjects(j.projects);
      else setErr(j.error || 'Failed to load projects');
    } catch { setErr('Local agent offline. Start RUN-ALL.bat.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, [reloadKey]);

  const load = async (name: string) => {
    try {
      const r = await fetch(`${AGENT}/3d/project/${encodeURIComponent(name)}/scad`);
      const j = await r.json();
      if (j.ok) onLoad(name, j.scad);
    } catch {}
  };

  return (
    <div className="border border-border rounded-md bg-muted/20 p-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Saved 3D Projects</div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={refresh} disabled={busy} title="Refresh">
          <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      {err && <div className="text-[10px] text-destructive">{err}</div>}
      {!err && projects.length === 0 && <div className="text-[10px] text-muted-foreground italic">No saved projects yet.</div>}
      <div className="space-y-0.5 max-h-40 overflow-auto">
        {projects.map((p) => (
          <button
            key={p.name}
            className="w-full flex items-center gap-2 text-xs px-1.5 py-1 rounded hover:bg-accent/10 text-left"
            onClick={() => void load(p.name)}
            title={`Load ${p.name}`}
          >
            <FolderOpen className="w-3 h-3 text-muted-foreground" />
            <span className="flex-1 truncate">{p.name}</span>
            <span className="text-[9px] text-muted-foreground font-mono">
              {p.hasStl ? `${(p.stlBytes / 1024).toFixed(0)}KB` : '—'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
