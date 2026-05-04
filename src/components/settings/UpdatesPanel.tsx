import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, FlaskConical, Download, Upload, Trash2, PlayCircle, RotateCcw, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { UpdatePanel } from '@/components/UpdatePanel';
import { useAgentStatus } from '@/hooks/use-agent-status';
import {
  getCurrentVersion,
  scanBundledUpdates,
  getLocalUpdates,
  applyLocalUpdate,
  getUpdateHistory,
  UPDATE_HISTORY_KEY,
  getBackup,
  rollback,
  importLocalUpdateFile,
} from '@/lib/update-system';
import { emitError } from '@/lib/error-bus';

const MANIFEST_PATH = 'public/updates/manifest.json';

interface AppliedShape {
  applied?: unknown[];
  count?: number;
  lastError?: string;
}

export function UpdatesPanel() {
  const agent = useAgentStatus(10000);
  const [version, setVersion] = useState(getCurrentVersion());
  const [diskApplied, setDiskApplied] = useState<{ ok: boolean; count: number; lastError?: string; error?: string } | null>(null);
  const [bundled, setBundled] = useState<number | null>(null);
  const [lastErr, setLastErr] = useState<string | null>(null);
  const [backup, setBackup] = useState(getBackup());
  const historyInputRef = useRef<HTMLInputElement>(null);
  const packageInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setBackup(getBackup());
    if (agent.connected) {
      try {
        const r = await fetch('http://127.0.0.1:3847/updates/applied', { signal: AbortSignal.timeout(2500) });
        if (r.ok) {
          const list: AppliedShape | unknown[] = await r.json();
          const arr = Array.isArray(list) ? list : Array.isArray(list?.applied) ? list.applied : [];
          const lastError = !Array.isArray(list) ? list?.lastError : undefined;
          setDiskApplied({ ok: true, count: arr.length, lastError });
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
      const r = await fetch('/updates/manifest.json');
      if (!r.ok) throw new Error(`manifest.json HTTP ${r.status}`);
      const j = await r.json();
      if (!j || typeof j !== 'object') throw new Error('manifest is not an object');
      toast.success(`Update self-test passed — manifest readable (${(j.updates || []).length} entries)`);
      setLastErr(null);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setLastErr(msg);
      emitError({ source: 'update', message: `Update self-test failed: ${msg}` });
    }
  };

  const applyAllBundled = async () => {
    try {
      const list = await getLocalUpdates();
      if (list.length === 0) { toast.info('No bundled updates to apply'); return; }
      let ok = 0;
      for (const u of list) {
        const r = applyLocalUpdate(u);
        if (r.success) ok++;
      }
      setVersion(getCurrentVersion());
      toast.success(`Applied ${ok}/${list.length} bundled update(s)`);
      refresh();
    } catch (e: any) {
      const msg = e?.message || String(e);
      setLastErr(msg);
      emitError({ source: 'update', message: `Apply bundled failed: ${msg}` });
    }
  };

  const clearBrowserHistory = () => {
    if (!confirm('Clear browser update history? This only clears localStorage records in this browser. Disk records (config/applied-updates.json) are NOT touched.')) return;
    localStorage.removeItem(UPDATE_HISTORY_KEY);
    toast.success('Browser update history cleared');
    refresh();
  };

  const exportHistory = () => {
    const blob = new Blob([JSON.stringify({ history: getUpdateHistory(), exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `update-history-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const importHistory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      if (Array.isArray(data?.history)) {
        localStorage.setItem(UPDATE_HISTORY_KEY, JSON.stringify(data.history.slice(0, 50)));
        toast.success(`Imported ${data.history.length} history entries`);
        refresh();
      } else {
        toast.error('JSON missing "history" array — use "Import update package JSON" for update packages');
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setLastErr(msg);
      emitError({ source: 'update', message: `History import failed: ${msg}` });
    } finally {
      if (historyInputRef.current) historyInputRef.current.value = '';
    }
  };

  const importPackage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const r = await importLocalUpdateFile(file);
      if (r.success && r.update) {
        toast.success(`Imported update package v${r.update.version} — apply it from the list below`);
        refresh();
      } else {
        toast.error(r.error || 'Invalid update package');
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setLastErr(msg);
      emitError({ source: 'update', message: `Package import failed: ${msg}` });
    } finally {
      if (packageInputRef.current) packageInputRef.current.value = '';
    }
  };

  const doRollback = () => {
    if (!backup) { toast.info('No backup available'); return; }
    if (!confirm(`Roll back to ${backup.version}? This restores app version + saved settings only. Source files on disk are NOT touched.`)) return;
    const r = rollback();
    if (r.success) {
      setVersion(getCurrentVersion());
      toast.success(`Rolled back to ${r.restoredVersion}`);
      refresh();
    } else {
      toast.error('Rollback failed — no backup found');
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
            <div className="text-xs text-muted-foreground mt-1 break-all">
              <code className="bg-muted px-1 py-0.5 rounded">{MANIFEST_PATH}</code>
            </div>
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
        <CardContent className="pt-0 flex flex-wrap gap-2">
          <Button size="sm" onClick={applyAllBundled}>
            <PlayCircle className="h-4 w-4 mr-2" /> Apply bundled updates now
          </Button>
          <Button size="sm" variant="outline" onClick={clearBrowserHistory}>
            <Trash2 className="h-4 w-4 mr-2" /> Clear browser update history
          </Button>
          <Button size="sm" variant="outline" onClick={exportHistory}>
            <Download className="h-4 w-4 mr-2" /> Export update history
          </Button>
          <Button size="sm" variant="outline" onClick={() => packageInputRef.current?.click()}>
            <Package className="h-4 w-4 mr-2" /> Import update package JSON
          </Button>
          <Button size="sm" variant="outline" onClick={() => historyInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Import update history JSON
          </Button>
          <input ref={packageInputRef} type="file" accept=".json" className="hidden" onChange={importPackage} />
          <input ref={historyInputRef} type="file" accept=".json" className="hidden" onChange={importHistory} />
        </CardContent>
        {(lastErr || diskApplied?.lastError) && (
          <CardContent className="pt-0">
            <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive break-all">
              <strong>Last update error:</strong> {lastErr || diskApplied?.lastError}
            </div>
          </CardContent>
        )}
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rollback</CardTitle>
          <CardDescription>
            Restores the previous app version + last saved settings only.
            Source files on disk are <strong>not</strong> reverted.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded border border-border p-3">
            <div className="text-xs text-muted-foreground">Latest backup version</div>
            <div className="text-lg font-mono">{backup?.version ?? '—'}</div>
          </div>
          <div className="rounded border border-border p-3">
            <div className="text-xs text-muted-foreground">Backup taken</div>
            <div className="text-lg font-mono">
              {backup?.timestamp ? new Date(backup.timestamp).toLocaleString() : '—'}
            </div>
          </div>
          <div className="rounded border border-border p-3">
            <div className="text-xs text-muted-foreground">Rollback available</div>
            <div className="text-lg font-mono">{backup ? 'yes' : 'no'}</div>
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <Button size="sm" variant="destructive" disabled={!backup} onClick={doRollback}>
            <RotateCcw className="h-4 w-4 mr-2" /> Roll back to {backup?.version || '—'}
          </Button>
        </CardContent>
      </Card>

      <UpdatePanel />
    </div>
  );
}
