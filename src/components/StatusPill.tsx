import { Loader2, Sparkles, Wrench, CheckCircle2, AlertCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatusState = 'idle' | 'thinking' | 'generating' | 'fixing' | 'done' | 'error';

const MAP: Record<StatusState, { label: string; icon: any; cls: string }> = {
  idle:       { label: 'Idle',       icon: Circle,        cls: 'text-muted-foreground' },
  thinking:   { label: 'Thinking',   icon: Loader2,       cls: 'text-blue-400 animate-spin' },
  generating: { label: 'Generating', icon: Sparkles,      cls: 'text-accent animate-pulse' },
  fixing:     { label: 'Fixing',     icon: Wrench,        cls: 'text-amber-400 animate-pulse' },
  done:       { label: 'Done',       icon: CheckCircle2,  cls: 'text-green-400' },
  error:      { label: 'Error',      icon: AlertCircle,   cls: 'text-destructive' },
};

export function StatusPill({ state, message, className }: { state: StatusState; message?: string; className?: string }) {
  const { label, icon: Icon, cls } = MAP[state];
  return (
    <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40 border border-border text-xs', className)}>
      <Icon className={cn('w-3.5 h-3.5', cls)} />
      <span className="font-medium">{label}</span>
      {message && <span className="text-muted-foreground">— {message}</span>}
    </div>
  );
}
