import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FileEdit, Terminal, Eye, Globe, Mic, Camera } from 'lucide-react';
import { useConfig, updateTools, type ToolConfig } from '@/lib/config-store';

const TOOLS: { key: keyof ToolConfig; label: string; desc: string; icon: any }[] = [
  { key: 'fileEditor', label: 'File Editor', desc: 'Read and edit project files', icon: FileEdit },
  { key: 'terminal', label: 'Terminal', desc: 'Run shell commands', icon: Terminal },
  { key: 'previewControl', label: 'Preview Control', desc: 'Trigger and refresh the preview', icon: Eye },
  { key: 'apiCaller', label: 'API Caller', desc: 'Make outbound HTTP requests', icon: Globe },
  { key: 'voiceInput', label: 'Voice Input', desc: 'Microphone capture (placeholder)', icon: Mic },
  { key: 'camera', label: 'Camera', desc: 'Camera capture (placeholder)', icon: Camera },
];

export function ToolsTab() {
  const cfg = useConfig();
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Tools</h3>
        <p className="text-sm text-muted-foreground">Toggle which tools assistants and the runtime can use</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Tools</CardTitle>
          <CardDescription>UI state only — wiring per tool is handled by each integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {TOOLS.map(t => {
            const Icon = t.icon;
            return (
              <div key={t.key} className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div>
                    <Label className="text-sm">{t.label}</Label>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
                <Switch checked={cfg.tools[t.key]}
                  onCheckedChange={(v) => updateTools({ [t.key]: v } as any)} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
