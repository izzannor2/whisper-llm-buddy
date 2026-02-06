import { useState, useCallback, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Copy,
  Check,
  Play,
  Save,
  Loader2,
  AlertTriangle,
  MessageSquarePlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  saveSnippet,
  generateSnippetId,
  detectLanguage,
  type CodeSnippet,
} from '@/lib/code-snippets-db';
import { runPython, loadPyodide, isPyodideLoaded } from '@/lib/python-runner';
import { executeCommand, getAgentStatus } from '@/lib/local-backend-agent';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  onAddToInput?: (text: string) => void;
}

interface ExecutionResult {
  output: string;
  exitCode: number;
  duration: number;
}

export function CodeBlock({ code, language, className, onAddToInput }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [outputCopied, setOutputCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [confirmState, setConfirmState] = useState<'idle' | 'confirming'>('idle');
  const [snippetTitle, setSnippetTitle] = useState('');
  const [isLoadingPyodide, setIsLoadingPyodide] = useState(false);
  const confirmTimeoutRef = useRef<number | null>(null);
  const { toast } = useToast();

  const detectedLang = language || detectLanguage(code);
  
  // Determine if code is executable
  const isPython = ['python', 'py'].includes(detectedLang.toLowerCase());
  const isShell = ['bash', 'sh', 'shell', 'zsh'].includes(detectedLang.toLowerCase());
  const isExecutable = isPython || isShell;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied to clipboard' });
  }, [code, toast]);

  const handleCopyOutput = useCallback(async () => {
    if (!executionResult) return;
    await navigator.clipboard.writeText(executionResult.output);
    setOutputCopied(true);
    setTimeout(() => setOutputCopied(false), 2000);
    toast({ title: 'Output copied' });
  }, [executionResult, toast]);

  const handleRunClick = useCallback(() => {
    // For shell scripts, require confirmation
    if (isShell && confirmState === 'idle') {
      setConfirmState('confirming');
      // Auto-reset after 5 seconds
      confirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmState('idle');
      }, 5000);
    } else {
      // Execute immediately for Python or after confirmation for shell
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
      setConfirmState('idle');
      executeCode();
    }
  }, [isShell, confirmState]);

  const executeCode = useCallback(async () => {
    setIsRunning(true);
    setExecutionResult(null);
    const startTime = performance.now();

    try {
      let output = '';
      let exitCode = 0;

      if (isPython) {
        if (!isPyodideLoaded()) {
          setIsLoadingPyodide(true);
          toast({ title: 'Loading Python runtime...' });
          await loadPyodide();
          setIsLoadingPyodide(false);
          toast({ title: 'Python runtime ready!' });
        }

        const result = await runPython(code);
        if (result.success) {
          output = result.output;
          exitCode = 0;
        } else {
          output = `Error: ${result.error}\n\n${result.output}`;
          exitCode = 1;
        }
      } else if (isShell) {
        const agentStatus = getAgentStatus();
        if (!agentStatus.connected) {
          output = '[Simulated] Agent not connected.\nDownload and run the LocalDev Agent for real execution.\n\n> ' + code.split('\n')[0];
          exitCode = 0;
        } else {
          const result = await executeCommand(code);
          if (result.success) {
            output = result.output;
            exitCode = 0;
          } else {
            output = `Error: ${result.error}\n\n${result.output}`;
            exitCode = 1;
          }
        }
      }

      const duration = Math.round(performance.now() - startTime);
      setExecutionResult({ output, exitCode, duration });
    } catch (error: any) {
      const duration = Math.round(performance.now() - startTime);
      setExecutionResult({
        output: `Failed to run: ${error.message}`,
        exitCode: 1,
        duration,
      });
    } finally {
      setIsRunning(false);
    }
  }, [code, isPython, isShell, toast]);

  const handleSaveToLibrary = useCallback(async () => {
    if (!snippetTitle.trim()) {
      toast({ variant: 'destructive', title: 'Please enter a title' });
      return;
    }

    const snippet: CodeSnippet = {
      id: generateSnippetId(),
      title: snippetTitle.trim(),
      language: detectedLang,
      code,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveSnippet(snippet);
    setShowSaveDialog(false);
    setSnippetTitle('');
    toast({ title: 'Saved to code library' });
    
    window.dispatchEvent(new CustomEvent('snippet-saved'));
  }, [snippetTitle, detectedLang, code, toast]);

  const handleAddToInput = useCallback(() => {
    if (executionResult && onAddToInput) {
      onAddToInput(executionResult.output);
      toast({ title: 'Added to input' });
    }
  }, [executionResult, onAddToInput, toast]);

  const handleSaveOutput = useCallback(async () => {
    if (!executionResult) return;
    
    const snippet: CodeSnippet = {
      id: generateSnippetId(),
      title: `Output - ${new Date().toLocaleString()}`,
      language: 'text',
      code: executionResult.output,
      tags: ['output'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveSnippet(snippet);
    toast({ title: 'Output saved to library' });
    window.dispatchEvent(new CustomEvent('snippet-saved'));
  }, [executionResult, toast]);

  return (
    <div className={cn('relative rounded-lg overflow-hidden border border-border', className)}>
      {/* Header bar with language and actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <span className="text-sm text-muted-foreground font-mono capitalize">
          {detectedLang}
        </span>
        
        <div className="flex items-center gap-1">
          {isExecutable && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-xs font-mono transition-all",
                confirmState === 'confirming' 
                  ? "text-amber-500 hover:text-amber-400 border border-amber-500/50 hover:bg-amber-500/10" 
                  : "hover:bg-accent/10"
              )}
              onClick={handleRunClick}
              disabled={isRunning || isLoadingPyodide}
            >
              {isRunning || isLoadingPyodide ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : confirmState === 'confirming' ? (
                <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1.5" />
              )}
              {confirmState === 'confirming' ? 'Are you sure?' : 'Run'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-mono"
            onClick={() => setShowSaveDialog(true)}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-mono"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 mr-1.5 text-accent" />
            ) : (
              <Copy className="w-3.5 h-3.5 mr-1.5" />
            )}
            Copy
          </Button>
        </div>
      </div>

      {/* Code display */}
      <SyntaxHighlighter
        language={detectedLang}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'hsl(var(--muted))',
          fontSize: '0.875rem',
          borderRadius: 0,
        }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>

      {/* Output panel - Docket style */}
      {executionResult && (
        <div className="border-t border-border bg-card">
          {/* Output header with exit code and timing */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-border/50">
            <span className="text-xs font-medium text-muted-foreground font-mono">Output</span>
            <span className={cn(
              "text-xs font-mono px-2 py-0.5 rounded",
              executionResult.exitCode === 0 
                ? "bg-accent/20 text-accent" 
                : "bg-destructive/20 text-destructive"
            )}>
              Exit {executionResult.exitCode} ({executionResult.duration}ms)
            </span>
          </div>
          
          {/* Output content */}
          <pre className="text-sm font-mono whitespace-pre-wrap text-foreground/90 p-4 max-h-64 overflow-auto">
            {executionResult.output || 'No output'}
          </pre>
          
          {/* Output actions - Docket style */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border/50 text-muted-foreground">
            <button
              onClick={handleCopyOutput}
              className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors"
            >
              {outputCopied ? (
                <Check className="w-3.5 h-3.5 text-accent" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              Copy
            </button>
            
            <button
              onClick={handleSaveOutput}
              className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
            
            {onAddToInput && (
              <button
                onClick={handleAddToInput}
                className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                Add to Input
              </button>
            )}
          </div>
        </div>
      )}

      {/* Save to library dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle>Save to Code Library</DialogTitle>
            <DialogDescription>
              Save this snippet to your local code library for later use.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Snippet title..."
              value={snippetTitle}
              onChange={(e) => setSnippetTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveToLibrary()}
              autoFocus
              className="bg-muted border-border"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveToLibrary}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
