import { useState, useEffect, useMemo } from 'react';
import { Check, X, FileCode, ArrowRight, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { readFile } from '@/lib/file-system';

interface DiffPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
  newContent: string;
  onApply: () => void;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // For large files, use a simpler approach
  if (m + n > 2000) {
    // Just show all as removed/added for very large diffs
    oldLines.forEach((line, i) => result.push({ type: 'removed', content: line, oldLineNo: i + 1 }));
    newLines.forEach((line, i) => result.push({ type: 'added', content: line, newLineNo: i + 1 }));
    return result;
  }

  // Build LCS table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build diff
  const diffLines: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffLines.unshift({ type: 'unchanged', content: oldLines[i - 1], oldLineNo: i, newLineNo: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffLines.unshift({ type: 'added', content: newLines[j - 1], newLineNo: j });
      j--;
    } else {
      diffLines.unshift({ type: 'removed', content: oldLines[i - 1], oldLineNo: i });
      i--;
    }
  }

  return diffLines;
}

export function DiffPreview({ open, onOpenChange, filePath, newContent, onApply }: DiffPreviewProps) {
  const [oldContent, setOldContent] = useState<string | null>(null);
  const [isNewFile, setIsNewFile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    readFile(filePath)
      .then(content => {
        setOldContent(content);
        setIsNewFile(false);
      })
      .catch(() => {
        setOldContent(null);
        setIsNewFile(true);
      })
      .finally(() => setLoading(false));
  }, [open, filePath]);

  const diffLines = useMemo(() => {
    if (loading || isNewFile) return [];
    return computeDiff(oldContent || '', newContent);
  }, [oldContent, newContent, loading, isNewFile]);

  const stats = useMemo(() => {
    const added = diffLines.filter(l => l.type === 'added').length;
    const removed = diffLines.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0" style={{
        background: 'hsl(330, 20%, 7%)',
        borderColor: 'hsl(330, 30%, 18%)',
      }}>
        <DialogHeader className="px-4 py-3 border-b shrink-0" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
          <DialogTitle className="flex items-center gap-2 text-sm text-pink-200">
            <FileCode className="w-4 h-4 text-pink-400" />
            <span className="font-mono">{filePath}</span>
            {!loading && (
              <span className="ml-auto flex items-center gap-3 text-xs font-normal">
                {isNewFile ? (
                  <span className="text-emerald-400">New file</span>
                ) : (
                  <>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Plus className="w-3 h-3" />{stats.added}
                    </span>
                    <span className="text-red-400 flex items-center gap-1">
                      <Minus className="w-3 h-3" />{stats.removed}
                    </span>
                  </>
                )}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview changes before applying to {filePath}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-pink-400/60 text-sm">
              Loading file…
            </div>
          ) : isNewFile ? (
            <div className="p-0">
              <div className="px-4 py-2 text-xs text-emerald-400/80 border-b" style={{ borderColor: 'hsl(330, 30%, 14%)' }}>
                This is a new file — full content will be created:
              </div>
              <pre className="text-xs font-mono p-4 text-pink-100/90 whitespace-pre-wrap">
                {newContent}
              </pre>
            </div>
          ) : (
            <div className="font-mono text-xs">
              {diffLines.map((line, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex",
                    line.type === 'added' && "bg-emerald-500/10",
                    line.type === 'removed' && "bg-red-500/10",
                  )}
                >
                  {/* Line numbers */}
                  <span className={cn(
                    "w-10 shrink-0 text-right pr-2 select-none border-r",
                    line.type === 'removed' ? "text-red-400/50 border-red-500/20" :
                    line.type === 'added' ? "text-emerald-400/50 border-emerald-500/20" :
                    "text-pink-500/30 border-pink-800/20"
                  )}>
                    {line.oldLineNo ?? ''}
                  </span>
                  <span className={cn(
                    "w-10 shrink-0 text-right pr-2 select-none border-r",
                    line.type === 'removed' ? "text-red-400/50 border-red-500/20" :
                    line.type === 'added' ? "text-emerald-400/50 border-emerald-500/20" :
                    "text-pink-500/30 border-pink-800/20"
                  )}>
                    {line.newLineNo ?? ''}
                  </span>

                  {/* Indicator */}
                  <span className={cn(
                    "w-6 shrink-0 text-center select-none",
                    line.type === 'added' && "text-emerald-400",
                    line.type === 'removed' && "text-red-400",
                    line.type === 'unchanged' && "text-transparent",
                  )}>
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>

                  {/* Content */}
                  <span className={cn(
                    "flex-1 whitespace-pre-wrap px-2 py-px",
                    line.type === 'added' && "text-emerald-200/90",
                    line.type === 'removed' && "text-red-200/70 line-through decoration-red-500/30",
                    line.type === 'unchanged' && "text-pink-200/60",
                  )}>
                    {line.content || ' '}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-4 py-3 border-t shrink-0 flex items-center gap-2" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
          <Button
            variant="ghost"
            size="sm"
            className="text-pink-400 hover:text-pink-200"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => { onApply(); onOpenChange(false); }}
          >
            <Check className="w-3.5 h-3.5 mr-1.5" />
            Apply Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
