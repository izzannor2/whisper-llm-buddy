import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, RotateCcw, Bug } from 'lucide-react';
import { toast } from 'sonner';
import { getBuffer, subscribe, type BusEvent } from '@/lib/error-bus';

interface PreviewHealthCardProps {
  isServerRunning: boolean;
  hasPreview: boolean;
  agentConnected: boolean;
  previewUrl?: string;
  previewSessionDir?: string | null;
  previewPort?: number | null;
  previewLastError?: string | null;
  onRestart?: () => void;
}

export function PreviewHealthCard(props: PreviewHealthCardProps) {
  const [busErrors, setBusErrors] = useState<BusEvent[]>(() => getBuffer());
  useEffect(() => subscribe(() => setBusErrors(getBuffer())), []);

  const lastBuildErr = [...busErrors].reverse().find(e => e.source === 'preview' || e.source === 'unknown');
  const mode: 'live' | 'iframe-fallback' | 'offline' = props.isServerRunning
    ? 'live'
    : props.hasPreview
      ? 'iframe-fallback'
      : 'offline';

  const modeBadge = (
    <Badge variant="outline" className={
      mode === 'live' ? 'text-green-500 border-green-500/40' :
      mode === 'iframe-fallback' ? 'text-amber-400 border-amber-400/40' :
      'text-destructive border-destructive/40'
    }>{mode}</Badge>
  );

  const copyDebug = async () => {
    const debug = {
      generatedAt: new Date().toISOString(),
      mode,
      previewUrl: props.previewUrl || null,
      previewPort: props.previewPort ?? null,
      previewSessionDir: props.previewSessionDir ?? null,
      isServerRunning: props.isServerRunning,
      agentConnected: props.agentConnected,
      previewLastError: props.previewLastError ?? null,
      lastBusEvent: lastBuildErr ? { ts: new Date(lastBuildErr.timestamp).toISOString(), source: lastBuildErr.source, message: lastBuildErr.message } : null,
    };
    await navigator.clipboard.writeText(JSON.stringify(debug, null, 2));
    toast.success('Preview debug JSON copied');
  };

  const copyUrl = async () => {
    if (!props.previewUrl) return toast.info('No preview URL yet');
    await navigator.clipboard.writeText(props.previewUrl);
    toast.success('Preview URL copied');
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm">Preview Health</CardTitle>
            <CardDescription className="text-xs">Real status of the App Builder preview surface.</CardDescription>
          </div>
          {modeBadge}
        </div>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-border p-2">
            <div className="text-muted-foreground">URL</div>
            <div className="font-mono break-all">{props.previewUrl || '—'}</div>
          </div>
          <div className="rounded border border-border p-2">
            <div className="text-muted-foreground">Port</div>
            <div className="font-mono">{props.previewPort ?? '—'}</div>
          </div>
          <div className="rounded border border-border p-2 col-span-2">
            <div className="text-muted-foreground">Session folder</div>
            <div className="font-mono break-all">{props.previewSessionDir || '—'}</div>
          </div>
          <div className="rounded border border-border p-2 col-span-2">
            <div className="text-muted-foreground">Last build error</div>
            <div className="font-mono break-all text-destructive">
              {props.previewLastError || (lastBuildErr ? lastBuildErr.message : '(none)')}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {props.onRestart && (
            <Button size="sm" variant="outline" onClick={props.onRestart} disabled={!props.agentConnected}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restart Preview
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={copyUrl} disabled={!props.previewUrl}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy URL
          </Button>
          <Button size="sm" variant="outline" onClick={copyDebug}>
            <Bug className="h-3.5 w-3.5 mr-1" /> Copy Preview Debug
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
