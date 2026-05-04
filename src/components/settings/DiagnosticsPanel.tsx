import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Download, RefreshCw, Server, Cpu, HardDrive, Activity, AlertTriangle, CheckCircle2, XCircle, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import { buildBundle, copyBundle, copySupportReport, downloadBundle, type DiagnosticBundle } from '@/lib/diagnostics';
import { subscribe, getBuffer, type BusEvent, emitError } from '@/lib/error-bus';
import { getModelCallLog, clearModelCallLog, type ModelCallRecord } from '@/lib/chat-api';

function StatusDot({ s }: { s: 'ok' | 'missing' | 'error' | 'offline' }) {
  if (s === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 inline" />;
  if (s === 'missing') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline" />;
  return <XCircle className="h-3.5 w-3.5 text-destructive inline" />;
}

export function DiagnosticsPanel() {
  const [bundle, setBundle] = useState<DiagnosticBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<BusEvent[]>(() => getBuffer());
  const [calls, setCalls] = useState<ModelCallRecord[]>(() => getModelCallLog());

  useEffect(() => {
    const unsub = subscribe(() => setErrors(getBuffer()));
    const onCall = () => setCalls(getModelCallLog());
    window.addEventListener('model-call-logged', onCall);
    return () => { unsub(); window.removeEventListener('model-call-logged', onCall); };
  }, []);

  const refresh = async () => {
    setBusy(true);
    try {
      const b = await buildBundle();
      setBundle(b);
    } catch (e: any) {
      emitError({ source: 'unknown', message: `Bundle generation failed: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const test = async (label: string, url: string) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.ok) toast.success(`${label} OK (${r.status})`);
      else toast.warning(`${label} responded ${r.status}`);
    } catch (e: any) {
      emitError({ source: 'agent', message: `${label} unreachable: ${e?.message || e}` });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">Diagnostic Bundle</CardTitle>
              <CardDescription>One-click snapshot for sharing or self-debugging.</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
                <RefreshCw className={`h-4 w-4 mr-2 ${busy ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button size="sm" variant="outline" disabled={!bundle} onClick={async () => { if (!bundle) return; await copyBundle(bundle); toast.success('Bundle copied'); }}>
                <Copy className="h-4 w-4 mr-2" /> Copy
              </Button>
              <Button size="sm" disabled={!bundle} onClick={() => bundle && downloadBundle(bundle)}>
                <Download className="h-4 w-4 mr-2" /> Save
              </Button>
              <Button size="sm" variant="secondary" disabled={!bundle} onClick={async () => { if (!bundle) return; await copySupportReport(bundle); toast.success('Full support report copied — paste into ChatGPT'); }}>
                <ClipboardPaste className="h-4 w-4 mr-2" /> Copy Full Support Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!bundle && <p className="text-muted-foreground">Generating…</p>}
          {bundle && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
              {[
                ['/status', bundle.status],
                ['/selftest', bundle.selftest],
                ['/debug/snapshot', bundle.debugSnapshot],
                ['/dev-server/status', bundle.devServerStatus],
                ['/agent/ollama-info', bundle.ollamaInfo],
                ['/updates/applied', bundle.updatesApplied],
                ['/3d/status', bundle.threeDStatus],
                ['/3d/diagnostics', bundle.threeD],
                ['model registry', bundle.modelRegistry],
                ['logs:agent', bundle.recentLogs.agent],
                ['logs:web', bundle.recentLogs.web],
                ['logs:llama', bundle.recentLogs.llama],
                ['logs:ollama', bundle.recentLogs.ollama],
                ['logs:server', bundle.recentLogs.server],
              ].map(([label, e]) => (
                <div key={label as string} className="flex items-center gap-2 px-2 py-1 rounded border border-border/40">
                  <StatusDot s={(e as any).status} />
                  <span className="flex-1 truncate">{label as string}</span>
                  <span className="text-muted-foreground">{(e as any).status}{(e as any).ms != null ? ` · ${(e as any).ms}ms` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Tests</CardTitle>
          <CardDescription>Hit a single endpoint and report the result.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => test('Self-test', 'http://127.0.0.1:3847/selftest')}>
            <Server className="h-4 w-4 mr-2" /> Run Self-Test
          </Button>
          <Button size="sm" variant="outline" onClick={() => test('Preview server', 'http://127.0.0.1:3847/dev-server/status')}>
            <Activity className="h-4 w-4 mr-2" /> Test Preview Server
          </Button>
          <Button size="sm" variant="outline" onClick={() => test('Ollama', 'http://127.0.0.1:11434/api/tags')}>
            <Cpu className="h-4 w-4 mr-2" /> Test Ollama
          </Button>
          <Button size="sm" variant="outline" onClick={() => test('GGUF scan', 'http://127.0.0.1:3847/scan/gguf')}>
            <HardDrive className="h-4 w-4 mr-2" /> Test GGUF
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Model Calls</CardTitle>
              <CardDescription>Last {calls.length} AI calls — role · backend · model · time · fallback.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{calls.length}</Badge>
              <Button size="sm" variant="ghost" onClick={() => { clearModelCallLog(); setCalls([]); }}>Clear</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px] rounded border border-border">
            {calls.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No model calls yet.</div>
            ) : (
              <ul className="text-xs font-mono divide-y divide-border">
                {calls.slice().reverse().slice(0, 20).map((c, i) => (
                  <li key={i} className={`px-3 py-1.5 flex gap-2 flex-wrap ${c.ok ? '' : 'text-destructive'}`}>
                    <span className="text-muted-foreground">{new Date(c.timestamp).toLocaleTimeString()}</span>
                    <span className="text-primary">[{c.role}]</span>
                    <span>{c.backend}</span>
                    <span className="text-muted-foreground">{c.model}</span>
                    <span className="ml-auto">{c.responseMs}ms</span>
                    {c.fallback && <span className="text-amber-400">fallback({c.fallbackReason?.slice(0, 40) || ''})</span>}
                    {c.overrideApplied && <span className="text-amber-300">override</span>}
                    {!c.ok && <span className="break-all">{c.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Errors</CardTitle>
              <CardDescription>Real events from the central error bus (last 200).</CardDescription>
            </div>
            <Badge variant="outline">{errors.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px] rounded border border-border">
            {errors.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No errors recorded.</div>
            ) : (
              <ul className="text-xs font-mono divide-y divide-border">
                {errors.slice().reverse().map(e => (
                  <li key={e.id} className="px-3 py-1.5 flex gap-2">
                    <span className="text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    <span className={e.level === 'error' ? 'text-destructive' : e.level === 'warn' ? 'text-amber-400' : 'text-muted-foreground'}>
                      [{e.source}]
                    </span>
                    <span className="flex-1 break-all">{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
