/**
 * Multi-agent build pipeline panel for the IDE App Builder.
 * Drives runBuildPipeline() and shows live progress through Planner →
 * Architect → Coder → Reviewer.
 */
import { useRef, useState } from 'react';
import { Rocket, Square, CheckCircle2, Loader2, AlertCircle, FileText, BrainCircuit, Hammer, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { runBuildPipeline, BuildEvent, BuildPhase } from '@/lib/build-pipeline';
import { ProjectFile } from '@/lib/ide-types';
import { getCurrentDirectory } from '@/lib/file-system';
import { toast } from 'sonner';

interface BuildPipelinePanelProps {
  files: ProjectFile[];
  onFilesUpdate: (files: ProjectFile[]) => void;
  onPreview: (files: ProjectFile[]) => void;
}

const PHASE_META: Record<BuildPhase, { label: string; icon: typeof BrainCircuit }> = {
  planning: { label: 'Planner', icon: BrainCircuit },
  architecting: { label: 'Architect', icon: FileText },
  coding: { label: 'Coder', icon: Hammer },
  reviewing: { label: 'Reviewer', icon: Search },
  done: { label: 'Complete', icon: CheckCircle2 },
  error: { label: 'Error', icon: AlertCircle },
};

interface LogEntry { phase: BuildPhase; message: string; t: number; }

export function BuildPipelinePanel({ files, onFilesUpdate, onPreview }: BuildPipelinePanelProps) {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<BuildPhase | null>(null);
  const [stats, setStats] = useState({ filesWritten: 0, diskWrites: 0, diskFailures: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const hasDir = !!getCurrentDirectory();

  const start = async () => {
    if (!goal.trim() || running) return;
    setRunning(true);
    setPhase('planning');
    setLogs([]);
    setStats({ filesWritten: 0, diskWrites: 0, diskFailures: 0 });
    abortRef.current = new AbortController();
    let lastFiles = files;
    try {
      await runBuildPipeline({
        goal,
        files,
        signal: abortRef.current.signal,
        onEvent: (e: BuildEvent) => {
          setPhase(e.phase);
          setStats({
            filesWritten: e.filesWritten,
            diskWrites: e.diskWrites,
            diskFailures: e.diskFailures,
          });
          setLogs((prev) => [...prev, { phase: e.phase, message: e.message, t: Date.now() }]);
          if (e.files) {
            lastFiles = e.files;
            onFilesUpdate(e.files);
          }
        },
      });
      onPreview(lastFiles);
      toast.success('Build pipeline complete');
    } catch (err: any) {
      if (err?.message === 'Build aborted') toast.info('Build stopped');
      else toast.error(err?.message || 'Build failed');
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stop = () => { abortRef.current?.abort(); };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" /> Multi-Agent Build
          </h3>
          {!hasDir && (
            <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/40">
              In-memory only
            </Badge>
          )}
        </div>
        <Textarea
          placeholder="Describe what to build, e.g. a kanban board with drag-and-drop and dark mode…"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          disabled={running}
          className="min-h-[80px] text-sm"
        />
        <div className="flex gap-2">
          {running ? (
            <Button onClick={stop} variant="destructive" className="flex-1 gap-2" size="sm">
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          ) : (
            <Button onClick={start} disabled={!goal.trim()} className="flex-1 gap-2" size="sm">
              <Rocket className="h-3.5 w-3.5" /> Start Build
            </Button>
          )}
        </div>
        {!hasDir && (
          <p className="text-xs text-muted-foreground">
            Open a folder from the file tree to also write files to disk.
          </p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1 p-2 border-b border-border">
        {(['planning', 'architecting', 'coding', 'reviewing'] as BuildPhase[]).map((p) => {
          const meta = PHASE_META[p];
          const Icon = meta.icon;
          const active = phase === p;
          const past = !!phase && (
            (['architecting', 'coding', 'reviewing', 'done'] as BuildPhase[]).indexOf(phase) >
            (['architecting', 'coding', 'reviewing', 'done'] as BuildPhase[]).indexOf(p)
          );
          return (
            <div
              key={p}
              className={cn(
                'flex flex-col items-center gap-0.5 p-2 rounded-md text-xs',
                active && 'bg-primary/10 text-primary',
                past && 'text-green-500',
                !active && !past && 'text-muted-foreground',
              )}
            >
              {active && running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              <span className="text-[10px]">{meta.label}</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-1 p-2 border-b border-border text-center">
        <div>
          <div className="text-[10px] text-muted-foreground">Files</div>
          <div className="text-sm font-mono">{stats.filesWritten}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Disk</div>
          <div className="text-sm font-mono">{stats.diskWrites}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Failed</div>
          <div className={cn('text-sm font-mono', stats.diskFailures > 0 && 'text-destructive')}>
            {stats.diskFailures}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1.5 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              Pipeline log will appear here.
            </div>
          ) : (
            logs.map((entry, i) => {
              const meta = PHASE_META[entry.phase];
              const Icon = meta.icon;
              return (
                <div key={i} className="flex items-start gap-2">
                  <Icon className={cn(
                    'h-3 w-3 mt-0.5 shrink-0',
                    entry.phase === 'error' ? 'text-destructive'
                      : entry.phase === 'done' ? 'text-green-500'
                      : 'text-primary',
                  )} />
                  <span className="text-muted-foreground opacity-60">
                    {new Date(entry.t).toLocaleTimeString()}
                  </span>
                  <span className="flex-1">{entry.message}</span>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
