import { useState, useCallback } from 'react';
import { Rocket, Loader2, CheckCircle, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface BuildStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

interface AutoBuildPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendMessage: (msg: string) => Promise<string>;
}

export function AutoBuildPanel({ open, onOpenChange, onSendMessage }: AutoBuildPanelProps) {
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<BuildStep[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [progress, setProgress] = useState(0);

  const startBuild = useCallback(async () => {
    if (!description.trim() || isBuilding) return;
    setIsBuilding(true);
    setProgress(0);

    const buildSteps: BuildStep[] = [
      { id: '1', label: 'Analyzing requirements', status: 'pending' },
      { id: '2', label: 'Creating project plan', status: 'pending' },
      { id: '3', label: 'Generating file structure', status: 'pending' },
      { id: '4', label: 'Writing core components', status: 'pending' },
      { id: '5', label: 'Adding styling & polish', status: 'pending' },
      { id: '6', label: 'Final review', status: 'pending' },
    ];
    setSteps(buildSteps);

    const prompts = [
      `I want to build: ${description}\n\nFirst, analyze the requirements. List what this project needs: features, pages, data models, and tech stack. Be specific.`,
      `Now create a detailed project plan with file structure. List every file that needs to be created with a one-line description of its purpose.`,
      `Generate the project structure. Create the main entry point, routing, and layout files. Output complete, working code.`,
      `Write the core components and pages. Output each file with complete code. Make everything functional — no placeholder comments.`,
      `Add styling, animations, responsive design, and visual polish. Update any files that need style improvements.`,
      `Review the entire project. Fix any issues, missing imports, or incomplete functionality. Output a summary of what was built.`,
    ];

    for (let i = 0; i < buildSteps.length; i++) {
      setSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'running' } : s));
      setProgress(((i) / buildSteps.length) * 100);

      try {
        const response = await onSendMessage(prompts[i]);
        setSteps(prev => prev.map((s, j) =>
          j === i ? { ...s, status: 'done', detail: response.slice(0, 100) + '...' } : s
        ));
      } catch (err: any) {
        setSteps(prev => prev.map((s, j) =>
          j === i ? { ...s, status: 'error', detail: err.message } : s
        ));
        break;
      }
    }

    setProgress(100);
    setIsBuilding(false);
  }, [description, isBuilding, onSendMessage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Auto-Build Project
          </DialogTitle>
        </DialogHeader>

        {steps.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Describe what you want to build. The AI will plan and generate the entire project step by step.
            </p>
            <Textarea
              placeholder="e.g., A task management app with drag-and-drop kanban board, user authentication, and dark mode..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px]"
            />
            <Button onClick={startBuild} disabled={!description.trim()} className="w-full gap-2">
              <Rocket className="w-4 h-4" />
              Start Building
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Progress value={progress} className="h-2" />
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {steps.map((step) => (
                  <div key={step.id} className={cn(
                    "flex items-start gap-3 p-2 rounded-lg",
                    step.status === 'running' && 'bg-primary/5',
                    step.status === 'error' && 'bg-destructive/5',
                  )}>
                    {step.status === 'running' ? (
                      <Loader2 className="w-4 h-4 mt-0.5 animate-spin text-primary shrink-0" />
                    ) : step.status === 'done' ? (
                      <CheckCircle className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
                    ) : step.status === 'error' ? (
                      <X className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{step.label}</p>
                      {step.detail && <p className="text-xs text-muted-foreground truncate">{step.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {!isBuilding && (
              <Button variant="outline" className="w-full" onClick={() => { setSteps([]); setProgress(0); }}>
                Start New Build
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
