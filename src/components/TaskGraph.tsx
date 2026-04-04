// Visual Task Graph — SVG-based task dependency visualization

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Network, RefreshCw, Trash2 } from 'lucide-react';
import {
  OrchestratorTask,
  getOrchestratorTasks,
  subscribeOrchestrator,
  removeOrchestratorTask,
  clearCompletedTasks,
} from '@/lib/orchestrator';
import { cn } from '@/lib/utils';

function useOrchestratorTasks() {
  return useSyncExternalStore(subscribeOrchestrator, getOrchestratorTasks, getOrchestratorTasks);
}

interface TaskGraphProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  queued: '#6b7280',
  running: '#3b82f6',
  paused: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#9ca3af',
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  paused: 'Paused',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function TaskGraph({ open, onOpenChange }: TaskGraphProps) {
  const tasks = useOrchestratorTasks();
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  const selected = tasks.find(t => t.id === selectedTask);

  // SVG layout
  const nodeWidth = 180;
  const nodeHeight = 60;
  const padding = 20;
  const gapX = 40;
  const gapY = 20;
  const cols = 3;

  const svgWidth = Math.max(600, cols * (nodeWidth + gapX) + padding * 2);
  const rows = Math.ceil(tasks.length / cols);
  const svgHeight = Math.max(200, rows * (nodeHeight + gapY) + padding * 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" />
            Task Graph
            <Badge variant="secondary" className="ml-2">{tasks.length} tasks</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <Button variant="outline" size="sm" onClick={() => clearCompletedTasks()}>
            <Trash2 className="w-3 h-3 mr-1" /> Clear Done
          </Button>
          {/* Legend */}
          <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
            {Object.entries(STATUS_COLORS).slice(0, 4).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                {STATUS_LABELS[status]}
              </div>
            ))}
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No tasks yet</p>
            <p className="text-xs mt-1">Tasks from the orchestrator and autonomous mode will appear here</p>
          </div>
        ) : (
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Graph */}
            <ScrollArea className="flex-1 border rounded-lg bg-muted/20">
              <svg width={svgWidth} height={svgHeight} className="select-none">
                {/* Draw connections from parent to children */}
                {tasks.map((task, i) => {
                  if (!task.parentId) return null;
                  const parentIdx = tasks.findIndex(t => t.id === task.parentId);
                  if (parentIdx === -1) return null;
                  const parentCol = parentIdx % cols;
                  const parentRow = Math.floor(parentIdx / cols);
                  const childCol = i % cols;
                  const childRow = Math.floor(i / cols);
                  const x1 = padding + parentCol * (nodeWidth + gapX) + nodeWidth / 2;
                  const y1 = padding + parentRow * (nodeHeight + gapY) + nodeHeight;
                  const x2 = padding + childCol * (nodeWidth + gapX) + nodeWidth / 2;
                  const y2 = padding + childRow * (nodeHeight + gapY);
                  return (
                    <line key={`edge-${task.id}`} x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4,4" opacity={0.4} />
                  );
                })}

                {/* Draw nodes */}
                {tasks.map((task, i) => {
                  const col = i % cols;
                  const row = Math.floor(i / cols);
                  const x = padding + col * (nodeWidth + gapX);
                  const y = padding + row * (nodeHeight + gapY);
                  const color = STATUS_COLORS[task.status] || '#6b7280';
                  const isSelected = selectedTask === task.id;

                  return (
                    <g key={task.id} onClick={() => setSelectedTask(task.id)} className="cursor-pointer">
                      <rect x={x} y={y} width={nodeWidth} height={nodeHeight} rx={8}
                        fill={isSelected ? `${color}33` : 'hsl(var(--card))'}
                        stroke={color} strokeWidth={isSelected ? 2.5 : 1.5}
                      />
                      {/* Status dot */}
                      <circle cx={x + 14} cy={y + nodeHeight / 2} r={5} fill={color} />
                      {/* Running animation */}
                      {task.status === 'running' && (
                        <circle cx={x + 14} cy={y + nodeHeight / 2} r={8} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5}>
                          <animate attributeName="r" from="5" to="12" dur="1.5s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                      )}
                      {/* Title */}
                      <text x={x + 28} y={y + 22} fill="hsl(var(--foreground))" fontSize={11} fontWeight={500}>
                        {task.goal.length > 20 ? task.goal.slice(0, 20) + '…' : task.goal}
                      </text>
                      {/* Status text */}
                      <text x={x + 28} y={y + 40} fill={color} fontSize={10}>
                        {STATUS_LABELS[task.status]} • {task.steps.length} steps
                      </text>
                      {/* Retry badge */}
                      {task.retryCount > 0 && (
                        <text x={x + nodeWidth - 20} y={y + 15} fill={color} fontSize={9} textAnchor="end">
                          ↻{task.retryCount}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </ScrollArea>

            {/* Detail panel */}
            {selected && (
              <div className="w-64 border rounded-lg p-3 space-y-3 bg-card">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm truncate">{selected.goal}</h4>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                    onClick={() => { removeOrchestratorTask(selected.id); setSelectedTask(null); }}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[selected.status] }} />
                  <span className="text-xs">{STATUS_LABELS[selected.status]}</span>
                  {selected.retryCount > 0 && (
                    <Badge variant="outline" className="text-[10px] h-4">Retry {selected.retryCount}/{selected.maxRetries}</Badge>
                  )}
                </div>

                {selected.error && (
                  <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{selected.error}</p>
                )}

                {/* Steps */}
                {selected.steps.length > 0 && (
                  <div className="space-y-1">
                    <h5 className="text-xs font-medium text-muted-foreground">Steps</h5>
                    {selected.steps.map(step => (
                      <div key={step.id} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[step.status] }} />
                        <span className="truncate">{step.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Logs */}
                {selected.logs.length > 0 && (
                  <div className="space-y-1">
                    <h5 className="text-xs font-medium text-muted-foreground">Logs</h5>
                    <ScrollArea className="h-32">
                      <div className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
                        {selected.logs.slice(-20).map((log, i) => (
                          <div key={i} className="truncate">{log}</div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground">
                  Created: {new Date(selected.createdAt).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
