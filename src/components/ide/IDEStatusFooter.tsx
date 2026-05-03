/**
 * Always-visible status strip at the bottom of the IDE.
 * Shows live CPU / RAM / Disk / GPU from the local agent (port 3847).
 * No fake numbers — when the agent is offline we say so.
 */
import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Activity, Clock, Server, AlertCircle, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

function fmtGB(b?: number) {
  if (!b || b < 0) return '—';
  return `${(b / 1024 / 1024 / 1024).toFixed(1)}GB`;
}
function fmtUptime(s: number) {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function tone(p: number) {
  if (p >= 90) return 'text-destructive';
  if (p >= 75) return 'text-amber-400';
  return 'text-green-500';
}

export function IDEStatusFooter({ agentConnected }: { agentConnected: boolean }) {
  const [hw, setHw] = useState<HwSnap | null>(null);

  useEffect(() => {
    if (!agentConnected) { setHw(null); return; }
    let alive = true;
    let es: EventSource | null = null;
    try {
      es = new EventSource('http://127.0.0.1:3847/scan/hardware/live');
      es.onmessage = (ev) => {
        if (!alive) return;
        try { setHw(JSON.parse(ev.data)); } catch { /* ignore */ }
      };
      es.onerror = () => { /* polling will cover */ };
    } catch { /* ignore */ }

    const poll = async () => {
      try {
        const r = await fetch('http://127.0.0.1:3847/scan/hardware', { signal: AbortSignal.timeout(2500) });
        if (r.ok && alive) setHw(await r.json());
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(iv); es?.close(); };
  }, [agentConnected]);

  if (!agentConnected) {
    return (
      <div className="border-t border-border bg-card px-3 py-1.5 flex items-center gap-3 text-xs">
        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Local agent offline — start the agent on port 3847 to see live CPU / RAM / Disk / GPU.</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => downloadAgentScript('windows')}>
          <Download className="h-3 w-3" /> Get Agent
        </Button>
      </div>
    );
  }

  if (!hw) {
    return (
      <div className="border-t border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
        Connecting to local agent…
      </div>
    );
  }

  const diskPct = hw.disk?.diskPercent ?? 0;

  return (
    <div className="border-t border-border bg-card px-3 py-1.5 flex items-center gap-4 text-xs font-mono overflow-x-auto whitespace-nowrap">
      <span className="flex items-center gap-1.5" title={hw.cpuModel}>
        <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">CPU</span>
        <span className={cn('tabular-nums', tone(hw.cpuPercent))}>{hw.cpuPercent}%</span>
        <span className="text-muted-foreground/70">· {hw.cpuCores}c</span>
      </span>

      <span className="flex items-center gap-1.5">
        <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">RAM</span>
        <span className={cn('tabular-nums', tone(hw.memPercent))}>{hw.memPercent}%</span>
        <span className="text-muted-foreground/70">{fmtGB(hw.usedMemBytes)} / {fmtGB(hw.totalMemBytes)}</span>
      </span>

      <span className="flex items-center gap-1.5">
        <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Disk</span>
        {hw.disk?.available ? (
          <>
            <span className={cn('tabular-nums', tone(diskPct))}>{diskPct}%</span>
            <span className="text-muted-foreground/70">{fmtGB(hw.disk.diskUsedBytes)} / {fmtGB(hw.disk.diskTotalBytes)}{hw.disk.mount ? ` · ${hw.disk.mount}` : ''}</span>
          </>
        ) : (
          <span className="text-muted-foreground/70">unavailable</span>
        )}
      </span>

      <span className="flex items-center gap-1.5 max-w-[280px] truncate" title={hw.gpu || 'No GPU detected'}>
        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">GPU</span>
        <span className="text-foreground/80 truncate">{hw.gpu || 'none'}</span>
      </span>

      <span className="flex items-center gap-1.5 ml-auto">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Up</span>
        <span className="tabular-nums text-foreground/80">{fmtUptime(hw.uptimeSec)}</span>
      </span>

      <span className="flex items-center gap-1.5">
        <Server className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{hw.platform}/{hw.arch}</span>
      </span>
    </div>
  );
}
