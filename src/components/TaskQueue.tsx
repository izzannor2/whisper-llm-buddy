import { useState, useEffect, useSyncExternalStore } from 'react';
import { X, Trash2, CheckCircle2, AlertCircle, Loader2, Clock, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getTasks, cancelTask, removeTask, clearCompleted, subscribeToTasks, Task } from '@/lib/task-runner';
import { cn } from '@/lib/utils';

function useTaskStore() {
  return useSyncExternalStore(subscribeToTasks, getTasks, getTasks);
}

interface TaskQueueProps {
  className?: string;
  collapsed?: boolean;
}

export function TaskQueue({ className, collapsed }: TaskQueueProps) {
  const tasks = useTaskStore();

  if (tasks.length === 0) return null;

  const activeTasks = tasks.filter(t => t.status === 'queued' || t.status === 'running');
  const completedTasks = tasks.filter(t => t.status !== 'queued' && t.status !== 'running');

  if (collapsed) {
    return activeTasks.length > 0 ? (
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>{activeTasks.length} task{activeTasks.length > 1 ? 's' : ''} running</span>
      </div>
    ) : null;
  }

  return (
    <div className={cn('border rounded-lg bg-card', className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-medium text-foreground">Task Queue</h3>
        {completedTasks.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearCompleted} className="h-6 text-xs gap-1">
            <Trash2 className="w-3 h-3" />
            Clear
          </Button>
        )}
      </div>
      <ScrollArea className="max-h-60">
        <div className="p-2 space-y-1.5">
          {tasks.map(task => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function TaskItem({ task }: { task: Task }) {
  const statusConfig = {
    queued: { icon: Clock, color: 'text-muted-foreground', label: 'Queued' },
    running: { icon: Loader2, color: 'text-primary', label: `${task.progress}%` },
    completed: { icon: CheckCircle2, color: 'text-green-500', label: 'Done' },
    failed: { icon: AlertCircle, color: 'text-destructive', label: 'Failed' },
    cancelled: { icon: X, color: 'text-muted-foreground', label: 'Cancelled' },
  }[task.status];

  const Icon = statusConfig.icon;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 text-xs">
      <Icon className={cn('w-3.5 h-3.5 shrink-0', statusConfig.color, task.status === 'running' && 'animate-spin')} />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium text-foreground">{task.name}</div>
        {task.status === 'running' && (
          <Progress value={task.progress} className="h-1 mt-1" />
        )}
        {task.error && (
          <div className="text-destructive truncate mt-0.5">{task.error}</div>
        )}
      </div>
      <span className={cn('text-[10px] shrink-0', statusConfig.color)}>{statusConfig.label}</span>
      {(task.status === 'queued' || task.status === 'running') && (
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => cancelTask(task.id)}>
          <X className="w-3 h-3" />
        </Button>
      )}
      {(task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') && (
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => removeTask(task.id)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
