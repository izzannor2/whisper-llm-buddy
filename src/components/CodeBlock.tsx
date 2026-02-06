import { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Copy,
  Check,
  Play,
  Save,
  Loader2,
  X,
  FolderOpen,
  AlertTriangle,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import {
  isFileSystemSupported,
  openDirectory,
  getCurrentDirectory,
  writeFile,
} from '@/lib/file-system';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showRunConfirm, setShowRunConfirm] = useState(false);
  const [snippetTitle, setSnippetTitle] = useState('');
  const [filePath, setFilePath] = useState('');
  const [isLoadingPyodide, setIsLoadingPyodide] = useState(false);
  const { toast } = useToast();

  const detectedLang = language || detectLanguage(code);
  
  // Determine if code is executable
  const isPython = ['python', 'py'].includes(detectedLang.toLowerCase());
  const isShell = ['bash', 'sh', 'shell', 'zsh'].includes(detectedLang.toLowerCase());
  const isExecutable = isPython || isShell;
  const canApplyToFile = isFileSystemSupported();

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied to clipboard' });
  }, [code, toast]);

  const handleRunClick = useCallback(() => {
    // Show confirmation for shell scripts
    if (isShell) {
      setShowRunConfirm(true);
    } else {
      executeCode();
    }
  }, [isShell]);

  const executeCode = useCallback(async () => {
    setShowRunConfirm(false);
    setIsRunning(true);
    setOutput(null);
    setShowOutput(true);

    try {
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
          setOutput(result.output);
        } else {
          setOutput(`Error: ${result.error}\n\n${result.output}`);
        }
      } else if (isShell) {
        const agentStatus = getAgentStatus();
        if (!agentStatus.connected) {
          setOutput('[Simulated] Agent not connected. Download and run the LocalDev Agent for real execution.\n\n' + code);
        } else {
          const result = await executeCommand(code);
          if (result.success) {
            setOutput(result.output);
          } else {
            setOutput(`Error: ${result.error}\n\n${result.output}`);
          }
        }
      }
    } catch (error: any) {
      setOutput(`Failed to run: ${error.message}`);
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

  const handleApplyToFile = useCallback(async () => {
    if (!filePath.trim()) {
      toast({ variant: 'destructive', title: 'Please enter a file path' });
      return;
    }

    try {
      let dir = getCurrentDirectory();
      if (!dir) {
        toast({ title: 'Select your project folder' });
        dir = await openDirectory();
        if (!dir) return;
      }

      await writeFile(filePath.trim(), code);
      setShowApplyDialog(false);
      setFilePath('');
      toast({ title: `Saved to ${filePath}` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: `Failed: ${error.message}` });
    }
  }, [filePath, code, toast]);

  const handleOpenDirectory = useCallback(async () => {
    try {
      await openDirectory();
      toast({ title: 'Project folder selected' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: error.message });
    }
  }, [toast]);

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
                "h-7 px-2 text-xs font-mono",
                showRunConfirm ? "text-amber-500 hover:text-amber-400" : "hover:bg-accent/10"
              )}
              onClick={handleRunClick}
              disabled={isRunning || isLoadingPyodide}
            >
              {isRunning || isLoadingPyodide ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1.5" />
              )}
              Run
            </Button>
          )}

          {canApplyToFile && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs font-mono text-green-500 hover:text-green-400 hover:bg-green-500/10"
              onClick={() => setShowApplyDialog(true)}
            >
              <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
              Apply
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

      {/* Output panel */}
      {showOutput && (
        <div className="border-t border-border bg-card p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-muted-foreground font-mono">Output</span>
            <Button
              variant="ghost"
              size="icon"
              className="w-5 h-5"
              onClick={() => setShowOutput(false)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          <pre className="text-sm font-mono whitespace-pre-wrap text-foreground/90 max-h-48 overflow-auto">
            {output || (isRunning ? 'Running...' : 'No output')}
          </pre>
        </div>
      )}

      {/* Run confirmation dialog */}
      <AlertDialog open={showRunConfirm} onOpenChange={setShowRunConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to execute a shell script on your machine. Make sure you trust this code before running it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4 p-3 bg-muted rounded-lg">
            <pre className="text-xs font-mono text-muted-foreground max-h-32 overflow-auto">
              {code.slice(0, 500)}{code.length > 500 ? '...' : ''}
            </pre>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeCode} className="bg-amber-600 hover:bg-amber-700">
              Run Script
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Apply to file dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle>Apply to File</DialogTitle>
            <DialogDescription>
              Save this code to a file in your project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenDirectory}
                className="shrink-0"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                {getCurrentDirectory()?.name || 'Select Folder'}
              </Button>
            </div>
            <Input
              placeholder="File path (e.g., src/utils/helper.ts)"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyToFile()}
              className="bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">
              This will create or overwrite the file in your selected project folder.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowApplyDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyToFile}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
