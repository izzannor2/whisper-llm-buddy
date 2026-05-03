import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, Sparkles, Cpu, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  getModelRegistry,
  subscribeRegistry,
  type ModelRegistrySnapshot,
  hasAnyLocalModel,
} from '@/lib/model-registry';
import {
  MODEL_ROLES,
  loadRouting,
  saveRouting,
  setRoleRouting,
  type ModelRole,
  type RoutingEntry,
} from '@/lib/model-routing';
import { CLOUD_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS, GOOGLE_MODELS } from '@/lib/chat-api';

const AUTO_VALUE = '__auto__';

function buildOptions(snap: ModelRegistrySnapshot | null, includeCloud: boolean) {
  const opts: { value: string; label: string; group: string }[] = [];
  if (snap) {
    for (const m of snap.ollama) opts.push({ value: `ollama::${m.name}`, label: m.name, group: 'Ollama' });
    for (const m of snap.gguf)   opts.push({ value: `gguf::${m.relPath || m.name}`, label: m.name, group: 'GGUF' });
  }
  if (includeCloud) {
    for (const m of CLOUD_MODELS)     opts.push({ value: `cloud::${m.id}`, label: m.name, group: 'Cloud (Lovable)' });
    for (const m of GOOGLE_MODELS)    opts.push({ value: `cloud::${m.id}`, label: m.name, group: 'Google' });
    for (const m of OPENAI_MODELS)    opts.push({ value: `cloud::${m.id}`, label: m.name, group: 'OpenAI' });
    for (const m of ANTHROPIC_MODELS) opts.push({ value: `cloud::${m.id}`, label: m.name, group: 'Anthropic' });
  }
  return opts;
}

function entryToValue(e: RoutingEntry): string {
  if (!e.model || e.provider === 'auto') return AUTO_VALUE;
  return `${e.provider}::${e.model}`;
}
function valueToEntry(v: string): RoutingEntry {
  if (v === AUTO_VALUE) return { provider: 'auto', model: '' };
  const [provider, ...rest] = v.split('::');
  return { provider: provider as RoutingEntry['provider'], model: rest.join('::') };
}

export function ModelRoutingPanel() {
  const [snap, setSnap] = useState<ModelRegistrySnapshot | null>(null);
  const [routing, setRouting] = useState(() => loadRouting());
  const [loading, setLoading] = useState(false);
  const [includeCloud, setIncludeCloud] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getModelRegistry(true);
      setSnap(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeRegistry(setSnap);
    return unsub;
  }, [refresh]);

  const options = buildOptions(snap, includeCloud);
  const optionsByGroup = options.reduce<Record<string, typeof options>>((acc, o) => {
    (acc[o.group] ||= []).push(o);
    return acc;
  }, {});

  const onChange = (role: ModelRole, value: string) => {
    const entry = valueToEntry(value);
    setRouting(prev => ({ ...prev, [role]: entry }));
    setRoleRouting(role, entry);
    toast.success(`Routing updated for ${role}`);
  };

  const noLocal = !hasAnyLocalModel(snap);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Model Routing</CardTitle>
            <CardDescription>Pick which detected model each workspace should use.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Rescan
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {snap && (
          <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
            <Badge variant="outline">Ollama: {snap.ollama.length} ({snap.ollamaSource})</Badge>
            <Badge variant="outline">GGUF: {snap.gguf.length} ({snap.ggufSource})</Badge>
            <button
              type="button"
              onClick={() => setIncludeCloud(v => !v)}
              className="underline hover:text-foreground"
            >
              {includeCloud ? 'Hide cloud models' : 'Show cloud models'}
            </button>
          </div>
        )}

        {noLocal && (
          <div className="p-3 rounded-md border border-amber-500/30 bg-amber-500/5 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No local models detected.</p>
              <p className="text-xs text-muted-foreground">
                Start Ollama (<code>START-OLLAMA-PORTABLE.bat</code>) and pull a model, or drop a
                <code> .gguf </code> file into <code>models/gguf/</code>.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {MODEL_ROLES.map(role => {
            const value = entryToValue(routing[role.id]);
            const entry = routing[role.id];
            const detected = entry.model
              ? options.find(o => o.value === value)
              : null;
            const missing = entry.model && !detected;
            return (
              <div key={role.id} className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-3 items-start py-2 border-b border-border/40 last:border-0">
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {role.label}
                    {missing && <Badge variant="destructive" className="text-[10px]">model missing</Badge>}
                    {!missing && entry.model && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <Select value={value} onValueChange={v => onChange(role.id, v)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Auto (use default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_VALUE}>Auto (use default / first detected)</SelectItem>
                      {Object.entries(optionsByGroup).map(([group, items]) => (
                        <div key={group}>
                          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{group}</div>
                          {items.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
