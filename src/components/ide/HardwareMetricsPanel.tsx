/**
 * Live system hardware panel for the IDE: CPU, RAM, Disk, GPU.
 * Streams from the local agent (port 3847). Falls back to polling.
 */
import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Server, Activity, Clock, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { downloadAgentScript } from '@/lib/local-backend-agent';

interface HwSnap {
  cpuPercent: number;
  cpuModel: string;
  cpuCores: number;
  totalMemBytes: number;
  usedMemBytes: number;
  memPercent: number;
  platform: string;
  arch: string;
  uptimeSec: number;
  loadAvg: number[];
  gpu?: string;
  disk?: {
    available: boolean;
    mount?: string;
    diskTotalBytes?: number;
    diskFreeBytes?: number;
    diskUsedBytes?: number;
    diskPercent?: number;
  };
}

function fmtBytes(b?: number) {
  if (!b || b < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function fmtUptime(s: number) {
  if (!s) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

function tone(p: number) {
  if (p >= 90) return 'text-destructive';
  if (p >= 75) return 'text-amber-400';
  return 'text-green-500';
}

function MetricBar({
  icon: Icon, label, percent, detail,
}: { icon: typeof Cpu; label: string; percent: number; detail: string }) {
  return (
    <div className="space-y-1.5 p-3 rounded-lg border border-border bg-card/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4" /> {label}
        </div>
        <span className={cn('text-sm font-mono tabular-nums', tone(percent))}>{percent}%</span>
      </div>
      <Progress value={percent} className="h-1.5" />
      <div className="text-xs text-muted-foreground truncate">{detail}</div>
    </div>
  );
}

export function HardwareMetricsPanel({ agentConnected }: { agentConnected: boolean }) {
  const [hw, setHw] = useState<HwSnap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentConnected) { setHw(null); return; }
    let alive = true;
    let es: EventSource | null = null;

    // Prefer SSE; fall back to polling.
    try {
      es = new EventSource('http://127.0.0.1:3847/scan/hardware/live');
      es.onmessage = (ev) => {
        if (!alive) return;
        try { setHw(JSON.parse(ev.data)); setError(null); } catch { /* ignore */ }
      };
      es.onerror = () => { /* let polling take over */ };
    } catch { /* ignore */ }

    const poll = async () => {
      try {
        const r = await fetch('http://127.0.0.1:3847/scan/hardware', { signal: AbortSignal.timeout(2500) });
        if (r.ok && alive) { setHw(await r.json()); setError(null); }
      } catch (e: any) { if (alive) setError(e?.message || 'Agent unreachable'); }
    };
    poll();
    const iv = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(iv); es?.close(); };
  }, [agentConnected]);

  if (!agentConnected) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div className="space-y-3 max-w-sm">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="text-sm font-medium">Local agent offline</h3>
          <p className="text-xs text-muted-foreground">
            Start the local agent on port 3847 to see live CPU, RAM, and disk usage.
          </p>
          <div className="flex gap-2 justify-center">
            <Button size="sm" variant="outline" onClick={() => downloadAgentScript('windows')}>Get Agent (Windows)</Button>
            <Button size="sm" variant="outline" onClick={() => downloadAgentScript('linux')}>Get Agent (Unix)</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!hw) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        {error ? `Waiting for agent… (${error})` : 'Loading hardware metrics…'}
      </div>
    );
  }

  const ramDetail = `${fmtBytes(hw.usedMemBytes)} / ${fmtBytes(hw.totalMemBytes)}`;
  const diskDetail = hw.disk?.available
    ? `${fmtBytes(hw.disk.diskUsedBytes)} / ${fmtBytes(hw.disk.diskTotalBytes)} • ${hw.disk.mount}`
    : 'Disk info unavailable';
  const cpuDetail = `${hw.cpuModel} · ${hw.cpuCores} cores`;

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">System</h3>
          <Badge variant="outline" className="gap-1 text-xs">
            <Server className="h-3 w-3" /> {hw.platform} / {hw.arch}
          </Badge>
        </div>

        <MetricBar icon={Cpu} label="CPU" percent={hw.cpuPercent} detail={cpuDetail} />
        <MetricBar icon={MemoryStick} label="Memory" percent={hw.memPercent} detail={ramDetail} />
        <MetricBar
          icon={HardDrive}
          label="Disk"
          percent={hw.disk?.diskPercent ?? 0}
          detail={diskDetail}
        />

        <div className="p-3 rounded-lg border border-border bg-card/40 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" /> GPU
          </div>
          <div className="text-xs text-muted-foreground truncate">{hw.gpu || 'No GPU detected'}</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg border border-border bg-card/40">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Uptime</div>
            <div className="text-sm font-mono mt-0.5">{fmtUptime(hw.uptimeSec)}</div>
          </div>
          <div className="p-2.5 rounded-lg border border-border bg-card/40">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Activity className="h-3 w-3" /> Load avg</div>
            <div className="text-sm font-mono mt-0.5 truncate">
              {hw.loadAvg.map((n) => n.toFixed(2)).join(' ')}
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
