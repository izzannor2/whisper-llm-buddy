import { useState, useEffect } from 'react';
import { Bot, ChevronDown, ChevronRight, Clock, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { AGENTS, AgentType } from '@/lib/agent-router';

export interface AgentStep {
  id: string;
  agentType: AgentType;
  action: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  detail?: string;
  timestamp: number;
  duration?: number;
}

interface AgentActivityPanelProps {
  steps: AgentStep[];
  currentAgent?: AgentType;
  isProcessing: boolean;
  className?: string;
}

export function AgentActivityPanel({ steps, currentAgent, isProcessing, className }: AgentActivityPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (steps.length === 0 && !isProcessing) return null;

  const agent = currentAgent ? AGENTS[currentAgent] : null;

  return (
    <div className={cn("border rounded-lg bg-card overflow-hidden", className)}>
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between px-3 py-2 h-auto"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium">Agent Activity</span>
          {isProcessing && agent && (
            <Badge variant="outline" className="text-[10px] h-5 animate-pulse">
              {agent.emoji} {agent.name}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] h-5">{steps.length}</Badge>
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </Button>

      {!isCollapsed && (
        <ScrollArea className="max-h-48 border-t">
          <div className="p-2 space-y-1">
            {steps.map((step) => {
              const stepAgent = AGENTS[step.agentType];
              return (
                <div key={step.id} className="flex items-start gap-2 py-1 px-2 rounded hover:bg-muted/30 text-xs">
                  {step.status === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 mt-0.5 animate-spin text-primary shrink-0" />
                  ) : step.status === 'complete' ? (
                    <CheckCircle className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                  ) : step.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-destructive shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]">{stepAgent.emoji}</span>
                      <span className="font-medium truncate">{step.action}</span>
                    </div>
                    {step.detail && (
                      <p className="text-muted-foreground truncate">{step.detail}</p>
                    )}
                  </div>
                  {step.duration && (
                    <span className="text-muted-foreground shrink-0">{(step.duration / 1000).toFixed(1)}s</span>
                  )}
                </div>
              );
            })}
            {isProcessing && (
              <div className="flex items-center gap-2 py-1 px-2 text-xs text-muted-foreground animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing...
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
