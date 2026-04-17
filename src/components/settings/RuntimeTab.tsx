import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield } from 'lucide-react';
import { useConfig, updateRuntime, type PreviewMode } from '@/lib/config-store';

const TOGGLES: { key: keyof ReturnType<typeof useConfig>['runtime']; label: string; desc: string }[] = [
  { key: 'enablePreviewRuntime', label: 'Enable Preview Runtime', desc: 'Allow runtime-based preview when available' },
  { key: 'useLocalDevAgent', label: 'Use LocalDev Agent', desc: 'Route preview through the local agent server' },
  { key: 'useDevServer', label: 'Use Dev Server Preview', desc: 'Use a running dev server (Vite/Webpack) for preview' },
  { key: 'forceLocalPreview', label: 'Force Local Preview', desc: 'Always render preview from project files (recommended)' },
];

export function RuntimeTab() {
  const cfg = useConfig();
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Runtime</h3>
        <p className="text-sm text-muted-foreground">Control how the preview is generated and rendered</p>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Preview always falls back to local rendering. The preview panel is never disabled.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runtime Toggles</CardTitle>
          <CardDescription>Optional execution paths for the preview</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {TOGGLES.map(t => (
            <div key={t.key} className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm">{t.label}</Label>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </div>
              <Switch checked={cfg.runtime[t.key] as boolean}
                onCheckedChange={(v) => updateRuntime({ [t.key]: v } as any)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview Mode</CardTitle>
          <CardDescription>Choose how the preview chooses between local and runtime</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={cfg.runtime.previewMode}
            onValueChange={(v) => updateRuntime({ previewMode: v as PreviewMode })}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (runtime if available, else local)</SelectItem>
              <SelectItem value="local-only">Local Only</SelectItem>
              <SelectItem value="runtime-only">Runtime Only (falls back to local on error)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}
