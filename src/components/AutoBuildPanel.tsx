import { useState, useCallback } from 'react';
import { Rocket, Loader2, CheckCircle, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { parseCodeBlocks } from '@/lib/code-parser';
import { writeFile } from '@/lib/file-system';
import { toast } from 'sonner';

interface BuildStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
  filesWritten?: number;
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
  const [totalFiles, setTotalFiles] = useState(0);

  const startBuild = useCallback(async () => {
    if (!description.trim() || isBuilding) return;
    setIsBuilding(true);
    setProgress(0);
    setTotalFiles(0);

    const buildSteps: BuildStep[] = [
      { id: '1', label: 'Analyzing requirements', status: 'pending' },
      { id: '2', label: 'Creating project plan', status: 'pending' },
      { id: '3', label: 'Generating file structure', status: 'pending' },
      { id: '4', label: 'Writing core components', status: 'pending' },
      { id: '5', label: 'Adding styling & polish', status: 'pending' },
      { id: '6', label: 'Final review', status: 'pending' },
    ];
    setSteps(buildSteps);

    const formatRule =
      '\n\nFor every file you want created or modified, output a complete code block using exactly this format on the opening fence: ```language:/full/path/to/file.ext (no spaces). Include the entire file contents — no placeholders, no diffs.';

    const prompts = [
      `I want to build: ${description}\n\nFirst, analyze the requirements. List what this project needs: features, pages, data models, and tech stack. Be specific. (No code in this step.)`,
      `Now create a detailed project plan with file structure. List every file that needs to be created with a one-line description of its purpose. (No code in this step.)`,
      `Generate the project structure. Create the main entry point, routing, and layout files.${formatRule}`,
      `Write the core components and pages. Make everything functional — no placeholder comments.${formatRule}`,
      `Add styling, animations, responsive design, and visual polish. Update any files that need style improvements.${formatRule}`,
      `Review the entire project. Fix any issues, missing imports, or incomplete functionality.${formatRule}`,
    ];

    let cumulativeFiles = 0;

    for (let i = 0; i < buildSteps.length; i++) {
      setSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'running' } : s));
      setProgress((i / buildSteps.length) * 100);

      try {
        const response = await onSendMessage(prompts[i]);
        const blocks = parseCodeBlocks(response);
        let writtenThisStep = 0;
        let writeFailed = 0;

        for (const block of blocks) {
          try {
            await writeFile(block.filePath, block.content);
            writtenThisStep++;
          } catch {
            writeFailed++;
          }
        }
        cumulativeFiles += writtenThisStep;
        setTotalFiles(cumulativeFiles);

        const detail = blocks.length === 0
          ? response.slice(0, 100).replace(/\s+/g, ' ').trim() + (response.length > 100 ? '…' : '')
          : `${writtenThisStep} file${writtenThisStep === 1 ? '' : 's'} written${writeFailed ? ` (${writeFailed} failed)` : ''}`;

        setSteps(prev => prev.map((s, j) =>
          j === i ? { ...s, status: 'done', detail, filesWritten: writtenThisStep } : s
        ));
      } catch (err: any) {
        setSteps(prev => prev.map((s, j) =>
          j === i ? { ...s, status: 'error', detail: err?.message || 'Step failed' } : s
        ));
        break;
      }
    }

    setProgress(100);
    setIsBuilding(false);

    if (cumulativeFiles > 0) {
      toast.success(`Auto-Build complete — ${cumulativeFiles} file${cumulativeFiles === 1 ? '' : 's'} written`);
    } else {
      toast.info('Auto-Build finished but no files were written. Open a project folder first or check the AI response format.');
    }
  }, [description, isBuilding, onSendMessage]);

  const reset = () => {
    setSteps([]);
    setProgress(0);
    setTotalFiles(0);
    setDescription('');
  };

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
              Describe what you want to build. The AI will plan the project, generate code, and write the files for you.
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
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{Math.round(progress)}% complete</span>
              <span>{totalFiles} file{totalFiles === 1 ? '' : 's'} written</span>
            </div>
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
              <Button variant="outline" className="w-full" onClick={reset}>
                Start New Build
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
