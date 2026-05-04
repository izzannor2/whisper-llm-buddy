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
  loadToggles,
  saveToggles,
  type ModelRole,
  type RoutingEntry,
  type RoutingToggles,
} from '@/lib/model-routing';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  const [toggles, setTogglesState] = useState<RoutingToggles>(() => loadToggles());
  const [loading, setLoading] = useState(false);
  const [includeCloud, setIncludeCloud] = useState(true);
  const updateToggle = (k: keyof RoutingToggles, v: boolean) => {
    const next = { ...toggles, [k]: v };
    setTogglesState(next);
    saveToggles(next);
  };

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

  const applyRecommended = useCallback(() => {
    if (!snap || !hasAnyLocalModel(snap)) {
      toast.error('No local models detected to recommend.');
      return;
    }
    // Recommendation: largest detected local model wins assistant/ide/improvement,
    // smallest wins voice for low latency. Vision/embeddings only set if the
    // model name hints at it.
    const local = [...snap.ollama, ...snap.gguf];
    const sortedBySize = [...local].sort((a, b) => (b.size || 0) - (a.size || 0));
    const big = sortedBySize[0];
    const small = sortedBySize[sortedBySize.length - 1] || big;
    const vision = local.find(m => /vision|llava|vl|image/i.test(m.name)) || null;
    const embed  = local.find(m => /embed|nomic|bge/i.test(m.name)) || null;
    const next = loadRouting();
    const assign = (role: ModelRole, m: typeof big) => {
      next[role] = { provider: m.provider as RoutingEntry['provider'], model: m.name };
    };
    if (big)   { assign('assistant', big); assign('ide', big); assign('improvement', big); assign('app-builder', big); }
    if (small) { assign('voice', small); }
    if (vision) assign('vision', vision);
    if (embed)  assign('embeddings', embed);
    saveRouting(next);
    setRouting(next);
    toast.success('Recommended routing applied.');
  }, [snap]);

  const scanHardware = useCallback(async () => {
    try {
      const r = await fetch('http://127.0.0.1:3847/scan/hardware', { signal: AbortSignal.timeout(2500) });
      if (!r.ok) throw new Error(`agent ${r.status}`);
      const hw = await r.json();
      const ramGb = (hw.totalMemBytes / 1024 / 1024 / 1024).toFixed(1);
      toast.success(`CPU ${hw.cpuPercent}% · ${hw.cpuCores} cores · RAM ${hw.memPercent}% of ${ramGb}GB${hw.gpu ? ' · ' + hw.gpu : ''}`);
    } catch (e: any) {
      toast.error(`Hardware scan failed: ${e.message || e}`);
    }
  }, []);

  const resetRouting = useCallback(() => {
    const empty = MODEL_ROLES.reduce((acc, r) => {
      acc[r.id] = { provider: 'auto' as const, model: '' };
      return acc;
    }, {} as Record<ModelRole, RoutingEntry>);
    saveRouting(empty);
    setRouting(empty);
    toast.success('Routing reset.');
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Model Routing</CardTitle>
            <CardDescription>Pick which detected model each workspace should use.</CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={applyRecommended} disabled={!snap}>
              <Sparkles className="w-4 h-4 mr-2" /> Recommended
            </Button>
            <Button variant="outline" size="sm" onClick={scanHardware}>
              <Cpu className="w-4 h-4 mr-2" /> Scan Hardware
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Rescan Models
            </Button>
            <Button variant="outline" size="sm" onClick={resetRouting}>
              <RotateCcw className="w-4 h-4 mr-2" /> Reset
            </Button>
          </div>
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
