import { useState, useEffect } from 'react';
import { Bot, Loader2, CheckCircle2, AlertCircle, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getCurrentExecution } from '@/lib/agent-executor';
import { cn } from '@/lib/utils';

interface AgentStatusProps {
  className?: string;
}

export function AgentStatus({ className }: AgentStatusProps) {
  const [status, setStatus] = useState<'idle' | 'thinking' | 'tool' | 'done' | 'error'>('idle');
  const [stepInfo, setStepInfo] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      const exec = getCurrentExecution();
      if (!exec || exec.status === 'completed') {
        setStatus('idle');
        setStepInfo('');
        return;
      }
      if (exec.status === 'error') {
        setStatus('error');
        setStepInfo('Error occurred');
        return;
      }
      const lastStep = exec.steps[exec.steps.length - 1];
      if (lastStep?.type === 'tool_call') {
        setStatus('tool');
        setStepInfo(`Running: ${lastStep.toolName}`);
      } else if (lastStep?.type === 'thinking') {
        setStatus('thinking');
        setStepInfo(lastStep.content);
      } else {
        setStatus('thinking');
        setStepInfo('Processing...');
      }
    }, 300);

    return () => clearInterval(interval);
  }, []);

  if (status === 'idle') return null;

  const config = {
    thinking: { icon: Loader2, label: 'AI Thinking', color: 'bg-primary/10 text-primary', spin: true },
    tool: { icon: Wrench, label: 'Running Tool', color: 'bg-accent/10 text-accent-foreground', spin: false },
    done: { icon: CheckCircle2, label: 'Done', color: 'bg-green-500/10 text-green-600', spin: false },
    error: { icon: AlertCircle, label: 'Error', color: 'bg-destructive/10 text-destructive', spin: false },
  }[status];

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn('gap-1.5 py-1 px-2.5 text-xs font-normal', config.color, className)}>
      <Icon className={cn('w-3.5 h-3.5', config.spin && 'animate-spin')} />
      <span className="truncate max-w-[200px]">{stepInfo || config.label}</span>
    </Badge>
  );
}
