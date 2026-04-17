import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Check } from 'lucide-react';
import {
  useConfig, upsertAssistant, deleteAssistant, setActiveAssistant,
  type AssistantConfig,
} from '@/lib/config-store';

const PERMS: { key: keyof AssistantConfig['permissions']; label: string }[] = [
  { key: 'editFiles', label: 'Can edit files' },
  { key: 'runPreview', label: 'Can run preview' },
  { key: 'callAgent', label: 'Can call runtime agent' },
  { key: 'useTools', label: 'Can use tools' },
  { key: 'accessApis', label: 'Can access APIs' },
];

function blank(): AssistantConfig {
  return {
    id: `a_${Date.now()}`,
    name: 'New Assistant',
    description: '',
    systemPrompt: '',
    model: '',
    permissions: { editFiles: false, runPreview: false, callAgent: false, useTools: false, accessApis: false },
  };
}

export function AssistantsTab() {
  const cfg = useConfig();
  const [editing, setEditing] = useState<AssistantConfig | null>(null);

  const providerModels = [
    cfg.providers.localAgent.model,
    cfg.providers.llama.model,
    cfg.providers.ollama.model,
    cfg.providers.remote.model,
  ].filter(Boolean);

  const startNew = () => setEditing(blank());
  const save = () => {
    if (!editing) return;
    upsertAssistant(editing);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Assistants</h3>
          <p className="text-sm text-muted-foreground">Create and manage assistant profiles</p>
        </div>
        <Button onClick={startNew} size="sm"><Plus className="h-4 w-4 mr-2" />New Assistant</Button>
      </div>

      <div className="grid gap-3">
        {cfg.assistants.map(a => (
          <Card key={a.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {a.name}
                  {cfg.activeAssistantId === a.id && <Badge>Active</Badge>}
                </CardTitle>
                <CardDescription>{a.description || 'No description'}</CardDescription>
              </div>
              <div className="flex gap-2">
                {cfg.activeAssistantId !== a.id && (
                  <Button size="sm" variant="outline" onClick={() => setActiveAssistant(a.id)}>
                    <Check className="h-3 w-3 mr-1" />Activate
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditing(a)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteAssistant(a.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Model: <span className="font-mono">{a.model || 'inherit'}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">{cfg.assistants.find(x => x.id === editing.id) ? 'Edit Assistant' : 'New Assistant'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>System Prompt</Label>
              <Textarea rows={6} value={editing.systemPrompt}
                onChange={e => setEditing({ ...editing, systemPrompt: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Model</Label>
              {providerModels.length > 0 ? (
                <Select value={editing.model} onValueChange={v => setEditing({ ...editing, model: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
                  <SelectContent>
                    {providerModels.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={editing.model} placeholder="Configure a provider first or type a model name"
                  onChange={e => setEditing({ ...editing, model: e.target.value })} />
              )}
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              {PERMS.map(p => (
                <div key={p.key} className="flex items-center justify-between">
                  <span className="text-sm">{p.label}</span>
                  <Switch checked={editing.permissions[p.key]}
                    onCheckedChange={v => setEditing({ ...editing, permissions: { ...editing.permissions, [p.key]: v } })} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
