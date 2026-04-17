import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfig } from '@/lib/config-store';
import { testConnection } from '@/lib/model-discovery';

interface RowState {
  ok: boolean;
  detail: string;
  models?: string[];
}

export function StatusTab() {
  const cfg = useConfig();
  const [state, setState] = useState<Record<string, RowState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const next: Record<string, RowState> = {};

    const agent = await testConnection('localAgent', { url: cfg.providers.localAgent.url });
    next.agent = { ok: agent.ok, detail: agent.ok ? `Connected at ${cfg.providers.localAgent.url}` : (agent.error || 'Disconnected') };

    const llama = await testConnection('llama', { url: cfg.providers.llama.url });
    next.llama = {
      ok: llama.ok,
      detail: llama.ok
        ? (llama.models?.length ? `Connected — ${llama.models.length} models` : 'Connected — no models loaded')
        : (llama.error || 'Disconnected'),
      models: llama.models,
    };

    const ollama = await testConnection('ollama', { url: cfg.providers.ollama.url });
    next.ollama = {
      ok: ollama.ok,
      detail: ollama.ok
        ? (ollama.models?.length ? `Connected — ${ollama.models.length} models` : 'Connected — model missing')
        : (ollama.error || 'Disconnected'),
      models: ollama.models,
    };

    next.previewRuntime = {
      ok: cfg.runtime.enablePreviewRuntime,
      detail: cfg.runtime.enablePreviewRuntime ? 'Runtime enabled' : 'Runtime disabled (local-only preview)',
    };

    const mode = cfg.runtime.forceLocalPreview || cfg.runtime.previewMode === 'local-only'
      ? 'srcdoc (local)'
      : cfg.runtime.useDevServer ? 'dev-server' : 'srcdoc (auto)';
    next.previewMode = { ok: true, detail: `Current preview mode: ${mode}` };

    setState(next);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.providers.localAgent.url, cfg.providers.llama.url, cfg.providers.ollama.url]);

  const ROWS: { key: string; label: string }[] = [
    { key: 'agent', label: 'LocalDev Agent' },
    { key: 'previewRuntime', label: 'Preview Runtime' },
    { key: 'previewMode', label: 'Current Preview Mode' },
    { key: 'llama', label: 'Llama' },
    { key: 'ollama', label: 'Ollama' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Status</h3>
          <p className="text-sm text-muted-foreground">Live system status (polls every 5s)</p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">System</CardTitle>
          <CardDescription>Click any row to expand details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {ROWS.map(r => {
            const s = state[r.key];
            const isOpen = expanded === r.key;
            return (
              <div key={r.key} className="border border-border rounded-md">
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition"
                  onClick={() => setExpanded(isOpen ? null : r.key)}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="text-sm">{r.label}</span>
                  </div>
                  <Badge variant={s?.ok ? 'default' : 'destructive'}>
                    {s ? (s.ok ? 'OK' : 'Error') : '...'}
                  </Badge>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 text-xs text-muted-foreground space-y-1">
                    <p>{s?.detail || 'No data'}</p>
                    {s?.models?.length ? (
                      <p className="font-mono">Models: {s.models.join(', ')}</p>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
