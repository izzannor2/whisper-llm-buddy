import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { useConfig, updateProviders } from '@/lib/config-store';
import { testConnection, type ConnectionResult } from '@/lib/model-discovery';
import { toast } from 'sonner';

type Key = 'localAgent' | 'llama' | 'ollama' | 'remote';

interface ProviderRow {
  key: Key;
  title: string;
  description: string;
  urlField: 'url' | 'baseUrl';
  showApiKey?: boolean;
}

const ROWS: ProviderRow[] = [
  { key: 'localAgent', title: 'LocalDev Agent', description: 'Local Node.js agent for shell + filesystem', urlField: 'url' },
  { key: 'llama', title: 'Llama Server', description: 'Local llama.cpp OpenAI-compatible server', urlField: 'url' },
  { key: 'ollama', title: 'Ollama', description: 'Ollama runtime with installed models', urlField: 'url' },
  { key: 'remote', title: 'Remote API Provider', description: 'Any OpenAI-compatible cloud endpoint', urlField: 'baseUrl', showApiKey: true },
];

export function ProvidersTab() {
  const cfg = useConfig();
  const [results, setResults] = useState<Record<Key, ConnectionResult | 'loading' | undefined>>({} as any);

  const test = async (key: Key) => {
    setResults(r => ({ ...r, [key]: 'loading' }));
    const p: any = cfg.providers[key];
    const res = await testConnection(key, p);
    setResults(r => ({ ...r, [key]: res }));
    if (res.ok) {
      toast.success(`${key}: ${res.models?.length || 0} models`);
      if (res.models?.length && !p.model) {
        updateProviders({ [key]: { ...p, model: res.models[0] } } as any);
      }
    } else {
      toast.error(`${key}: ${res.error}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Providers</h3>
          <p className="text-sm text-muted-foreground">Configure AI backends and select active provider</p>
        </div>
        <Select value={cfg.providers.active} onValueChange={(v) => updateProviders({ active: v as Key })}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROWS.map(r => <SelectItem key={r.key} value={r.key}>{r.title} (active)</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {ROWS.map(row => {
        const p: any = cfg.providers[row.key];
        const result = results[row.key];
        const models = result && result !== 'loading' && result.ok ? result.models || [] : [];
        return (
          <Card key={row.key}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {row.title}
                  {result === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {result && result !== 'loading' && result.ok && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {result && result !== 'loading' && !result.ok && <XCircle className="h-4 w-4 text-destructive" />}
                  {cfg.providers.active === row.key && <Badge variant="outline">Active</Badge>}
                </CardTitle>
                <CardDescription>{row.description}</CardDescription>
              </div>
              <Switch checked={p.enabled} onCheckedChange={(v) => updateProviders({ [row.key]: { ...p, enabled: v } } as any)} />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <Label>{row.urlField === 'baseUrl' ? 'Base URL' : 'URL'}</Label>
                <Input
                  value={p[row.urlField] || ''}
                  onChange={(e) => updateProviders({ [row.key]: { ...p, [row.urlField]: e.target.value } } as any)}
                  placeholder="http://..."
                />
              </div>
              {row.showApiKey && (
                <div className="grid gap-2">
                  <Label>API Key</Label>
                  <Input type="password" value={p.apiKey || ''}
                    onChange={(e) => updateProviders({ [row.key]: { ...p, apiKey: e.target.value } } as any)}
                    placeholder="sk-..." />
                </div>
              )}
              <div className="grid gap-2">
                <Label>Model</Label>
                {models.length > 0 ? (
                  <Select value={p.model} onValueChange={(v) => updateProviders({ [row.key]: { ...p, model: v } } as any)}>
                    <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
                    <SelectContent>
                      {models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={p.model || ''} placeholder="No models detected — type model name"
                    onChange={(e) => updateProviders({ [row.key]: { ...p, model: e.target.value } } as any)} />
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => test(row.key)} disabled={result === 'loading'}>
                  <RefreshCw className={`h-3 w-3 mr-2 ${result === 'loading' ? 'animate-spin' : ''}`} />
                  Test Connection
                </Button>
                {result && result !== 'loading' && !result.ok && (
                  <span className="text-xs text-destructive self-center">{result.error}</span>
                )}
                {result && result !== 'loading' && result.ok && (
                  <span className="text-xs text-green-500 self-center">{result.models?.length || 0} models found</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
