/**
 * Real-time top-bar status indicators (Agent / Build / Preview / System / Model).
 * Pulls live data from the local agent (CPU/RAM, preview status) plus the
 * model registry. No fake data: when nothing is detected we say so.
 */
import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, Bot, Rocket, Eye, Brain } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAgentStatus } from '@/hooks/use-agent-status';
import { useModelsAvailable } from '@/hooks/use-models-available';
import { resolveModelSync } from '@/lib/model-routing';

type BuildState = 'idle' | 'generating' | 'building' | 'ready' | 'error';
type PreviewState = 'not-started' | 'starting' | 'live' | 'error';

interface PreviewSnap { status: string; port: number; url: string | null; }
interface HwSnap { cpuPercent: number; memPercent: number; }

export function SystemStatusBar({ className, buildState = 'idle' }: { className?: string; buildState?: BuildState }) {
  const agent = useAgentStatus(5000);
  const { snapshot, hasAny } = useModelsAvailable();
  const [hw, setHw] = useState<HwSnap | null>(null);
  const [preview, setPreview] = useState<PreviewState>('not-started');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Hardware polling — falls back silently if the agent is offline.
  useEffect(() => {
    if (!agent.connected) { setHw(null); return; }
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('http://127.0.0.1:3847/scan/hardware', { signal: AbortSignal.timeout(2000) });
        if (r.ok && alive) setHw(await r.json());
      } catch { /* ignore */ }
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(iv); };
  }, [agent.connected]);

  // Preview status polling.
  useEffect(() => {
    if (!agent.connected) { setPreview('not-started'); setPreviewUrl(null); return; }
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('http://127.0.0.1:3847/dev-server/status', { signal: AbortSignal.timeout(2000) });
        if (!r.ok) return;
        const d: PreviewSnap = await r.json();
        if (!alive) return;
        const map: Record<string, PreviewState> = {
          idle: 'not-started', starting: 'starting', live: 'live', error: 'error',
        };
        setPreview(map[d.status] || 'not-started');
        setPreviewUrl(d.url);
      } catch { /* ignore */ }
    };
    tick();
    const iv = setInterval(tick, 2500);
    return () => { alive = false; clearInterval(iv); };
  }, [agent.connected]);

  const agentLabel = agent.connected ? 'Agent online' : 'Agent offline';
  const agentTone = agent.connected ? 'text-green-500 border-green-500/40' : 'text-muted-foreground border-border';

  const buildLabel = ({
    idle: 'Build idle', generating: 'Generating', building: 'Building', ready: 'Build ready', error: 'Build error',
  } as const)[buildState];
  const buildTone = buildState === 'error' ? 'text-destructive border-destructive/40'
    : buildState === 'ready' ? 'text-green-500 border-green-500/40'
    : buildState === 'idle' ? 'text-muted-foreground border-border'
    : 'text-primary border-primary/40 animate-pulse';

  const previewLabel = ({
    'not-started': 'Preview off', starting: 'Preview starting', live: 'Preview live', error: 'Preview error',
  } as const)[preview];
  const previewTone = preview === 'error' ? 'text-destructive border-destructive/40'
    : preview === 'live' ? 'text-green-500 border-green-500/40'
    : preview === 'starting' ? 'text-primary border-primary/40 animate-pulse'
    : 'text-muted-foreground border-border';

  // Active assistant model (real, from routing → registry)
  const resolved = resolveModelSync('assistant', snapshot);
  const modelLabel = resolved.detected
    ? `${resolved.detected.name}`
    : hasAny ? 'No routing set' : 'No models detected';
  const modelTone = resolved.detected ? 'text-primary border-primary/40' : 'text-muted-foreground border-border';

  return (
    <div className={cn('flex items-center gap-2 flex-wrap text-xs', className)}>
      <Badge variant="outline" className={cn('gap-1.5', agentTone)}>
        <Bot className="w-3 h-3" /> {agentLabel}
      </Badge>
      <Badge variant="outline" className={cn('gap-1.5', buildTone)}>
        <Rocket className="w-3 h-3" /> {buildLabel}
      </Badge>
      <a
        href={previewUrl || '#'}
        target={previewUrl ? '_blank' : undefined}
        rel="noreferrer"
        className={cn(!previewUrl && 'pointer-events-none')}
      >
        <Badge variant="outline" className={cn('gap-1.5 cursor-pointer', previewTone)}>
          <Eye className="w-3 h-3" /> {previewLabel}{previewUrl ? ` :${new URL(previewUrl).port}` : ''}
        </Badge>
      </a>
      {hw && (
        <>
          <Badge variant="outline" className="gap-1.5 text-muted-foreground border-border">
            <Cpu className="w-3 h-3" /> CPU {hw.cpuPercent}%
          </Badge>
          <Badge variant="outline" className="gap-1.5 text-muted-foreground border-border">
            <MemoryStick className="w-3 h-3" /> RAM {hw.memPercent}%
          </Badge>
        </>
      )}
      <Badge variant="outline" className={cn('gap-1.5 max-w-[180px] truncate', modelTone)}>
        <Brain className="w-3 h-3 shrink-0" /> <span className="truncate">{modelLabel}</span>
      </Badge>
    </div>
  );
}
