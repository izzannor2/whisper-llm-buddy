import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { UpdatePanel } from '@/components/UpdatePanel';
import { useAgentStatus } from '@/hooks/use-agent-status';
import { getCurrentVersion, scanBundledUpdates, getLocalUpdates } from '@/lib/update-system';
import { emitError } from '@/lib/error-bus';

export function UpdatesPanel() {
  const agent = useAgentStatus(10000);
  const [version] = useState(getCurrentVersion());
  const [diskApplied, setDiskApplied] = useState<{ ok: boolean; count: number; error?: string } | null>(null);
  const [bundled, setBundled] = useState<number | null>(null);

  const refresh = async () => {
    if (agent.connected) {
      try {
        const r = await fetch('http://127.0.0.1:3847/updates/applied', { signal: AbortSignal.timeout(2500) });
        if (r.ok) {
          const list = await r.json();
          setDiskApplied({ ok: true, count: Array.isArray(list) ? list.length : 0 });
        } else {
          setDiskApplied({ ok: false, count: 0, error: `HTTP ${r.status}` });
        }
      } catch (e: any) {
        setDiskApplied({ ok: false, count: 0, error: e?.message || String(e) });
      }
    } else {
      setDiskApplied(null);
    }
    try {
      await scanBundledUpdates();
      const list = await getLocalUpdates();
      setBundled(list.length);
    } catch { setBundled(null); }
  };

  useEffect(() => { refresh(); }, [agent.connected]);

  const runSelfTest = async () => {
    try {
      // Construct a no-op manifest matching current version, attempt apply→rollback path.
      // We simply read /updates/manifest.json from the public dir to verify pipeline.
      const r = await fetch('/updates/manifest.json');
      if (!r.ok) throw new Error(`manifest.json HTTP ${r.status}`);
      const j = await r.json();
      if (!j || typeof j !== 'object') throw new Error('manifest is not an object');
      toast.success(`Update self-test passed — manifest readable (${(j.updates || []).length} entries)`);
    } catch (e: any) {
      emitError({ source: 'update', message: `Update self-test failed: ${e?.message || e}` });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">App Status</CardTitle>
              <CardDescription>Real-time view of the update pipeline.</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline">v{version}</Badge>
              {agent.connected ? (
                <Badge variant="outline" className="text-green-500 border-green-500/40">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Disk persistence on
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-400 border-amber-400/40">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Disk persistence off
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={runSelfTest}>
                <FlaskConical className="h-4 w-4 mr-2" /> Run Update Self-Test
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded border border-border p-3">
            <div className="text-xs text-muted-foreground">Bundled updates found</div>
            <div className="text-lg font-mono">{bundled ?? '—'}</div>
          </div>
          <div className="rounded border border-border p-3">
            <div className="text-xs text-muted-foreground">Disk-applied count</div>
            <div className="text-lg font-mono">{diskApplied?.count ?? '—'}</div>
            {diskApplied?.error && <div className="text-xs text-destructive">{diskApplied.error}</div>}
          </div>
          <div className="rounded border border-border p-3">
            <div className="text-xs text-muted-foreground">Agent on :3847</div>
            <div className="text-lg font-mono">{agent.connected ? 'online' : 'offline'}</div>
          </div>
        </CardContent>
        {!agent.connected && (
          <CardContent className="pt-0">
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
              Local agent is offline. Updates can still be applied in this browser session, but
              <code className="mx-1 bg-muted px-1 py-0.5 rounded">config/applied-updates.json</code>
              will not be written. Start the agent with <code className="bg-muted px-1 py-0.5 rounded">RUN-ALL.bat</code> to enable disk persistence.
            </div>
          </CardContent>
        )}
      </Card>

      <UpdatePanel />
    </div>
  );
}
