import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Sparkles, FileText, FolderOpen, ChevronRight, ChevronDown,
  RefreshCw, Loader2, Lightbulb, Mic, MicOff, Send, Wand2, Zap,
  Shield, Palette, Bug, Gauge, ArrowDown, History, Plus, Trash2,
  CheckSquare, Square, X, CheckCheck, FileCode, Check, Upload, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { applyModeTheme, getModeSystemPrompt } from '@/lib/mode-themes';
import { sendChatMessage, loadSettings } from '@/lib/chat-api';
import { speak, isTTSSupported } from '@/lib/tts';
import { generateId } from '@/lib/ide-store';
import { saveConversation, getAllConversations, deleteConversation, Conversation } from '@/lib/db';
import { cn } from '@/lib/utils';
import { isWhisperLoaded, getDownloadedModels, transcribeAudio, loadWhisperModel, getSelectedWhisperModel } from '@/lib/local-stt';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from '@/components/CodeBlock';
import { parseCodeBlocks, ParsedCodeBlock } from '@/lib/code-parser';
import { writeFile } from '@/lib/file-system';
import { DiffPreview } from '@/components/DiffPreview';
import { buildPreviewHTML } from '@/lib/preview-builder';

interface FileNode { name: string; path: string; type: 'file' | 'directory'; children?: FileNode[]; }
interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; }

const DEFAULT_PROJECT_TREE: FileNode[] = [
  { name: 'src', path: 'src', type: 'directory', children: [
    { name: 'pages', path: 'src/pages', type: 'directory', children: [
      { name: 'Index.tsx', path: 'src/pages/Index.tsx', type: 'file' },
      { name: 'IDE.tsx', path: 'src/pages/IDE.tsx', type: 'file' },
      { name: 'IoTWorkspace.tsx', path: 'src/pages/IoTWorkspace.tsx', type: 'file' },
      { name: 'SandboxWorkspace.tsx', path: 'src/pages/SandboxWorkspace.tsx', type: 'file' },
      { name: 'ImproveWorkspace.tsx', path: 'src/pages/ImproveWorkspace.tsx', type: 'file' },
    ]},
    { name: 'components', path: 'src/components', type: 'directory', children: [
      { name: 'ChatInput.tsx', path: 'src/components/ChatInput.tsx', type: 'file' },
      { name: 'ChatMessage.tsx', path: 'src/components/ChatMessage.tsx', type: 'file' },
      { name: 'ChatSidebar.tsx', path: 'src/components/ChatSidebar.tsx', type: 'file' },
      { name: 'EmptyState.tsx', path: 'src/components/EmptyState.tsx', type: 'file' },
      { name: 'PlanningView.tsx', path: 'src/components/PlanningView.tsx', type: 'file' },
    ]},
    { name: 'lib', path: 'src/lib', type: 'directory', children: [
      { name: 'chat-api.ts', path: 'src/lib/chat-api.ts', type: 'file' },
      { name: 'mode-themes.ts', path: 'src/lib/mode-themes.ts', type: 'file' },
      { name: 'ide-store.ts', path: 'src/lib/ide-store.ts', type: 'file' },
      { name: 'python-runner.ts', path: 'src/lib/python-runner.ts', type: 'file' },
    ]},
    { name: 'App.tsx', path: 'src/App.tsx', type: 'file' },
  ]},
];

const QUICK_SUGGESTIONS = [
  { icon: Bug, label: 'Fix bugs', prompt: 'Scan the selected files for potential bugs and fix them. Focus on runtime errors, edge cases, and null checks. For every fix, output the COMPLETE corrected file using the format ```language:/path/to/file.ext so I can apply them.' },
  { icon: Gauge, label: 'Optimize', prompt: 'Analyze the selected files for performance bottlenecks and optimize them. Focus on rendering, bundle size, and memory leaks. Output the COMPLETE corrected file for each change using ```language:/path/to/file.ext format.' },
  { icon: Shield, label: 'Security', prompt: 'Review the selected files for security vulnerabilities and fix them. Check for XSS, injection, and auth issues. Output the COMPLETE corrected file for each fix using ```language:/path/to/file.ext format.' },
  { icon: Palette, label: 'Polish UI', prompt: 'Review the selected files for UI/UX improvements. Focus on accessibility, responsive design, and visual consistency. Output the COMPLETE corrected file using ```language:/path/to/file.ext format.' },
  { icon: Zap, label: 'Add features', prompt: 'What are the most impactful features we could add? Output complete file contents using ```language:/path/to/file.ext format for each new or modified file.' },
  { icon: Wand2, label: 'Refactor', prompt: 'Identify areas in the selected files that need refactoring. Focus on code duplication, complexity, and maintainability. Output the COMPLETE refactored file for each change using ```language:/path/to/file.ext format.' },
];

// Collect all file paths from tree
function collectAllFiles(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'file') paths.push(node.path);
    if (node.children) paths.push(...collectAllFiles(node.children));
  }
  return paths;
}

// Collect file paths under a directory node
function collectChildFiles(node: FileNode): string[] {
  if (node.type === 'file') return [node.path];
  return node.children?.flatMap(collectChildFiles) ?? [];
}

// Check if all children of a directory are selected
function areAllChildrenSelected(node: FileNode, selectedFiles: Set<string>): boolean {
  const childPaths = collectChildFiles(node);
  return childPaths.length > 0 && childPaths.every(p => selectedFiles.has(p));
}

// Scan a directory handle into FileNode tree
async function scanDirectoryHandle(dirHandle: FileSystemDirectoryHandle, basePath = ''): Promise<FileNode[]> {
  const nodes: FileNode[] = [];
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__']);
  
  for await (const entry of (dirHandle as any).values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (skipDirs.has(entry.name)) continue;
      const children = await scanDirectoryHandle(entry, entryPath);
      nodes.push({ name: entry.name, path: entryPath, type: 'directory', children });
    } else {
      nodes.push({ name: entry.name, path: entryPath, type: 'file' });
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Build tree from uploaded file list
function buildTreeFromFileList(files: FileList): FileNode[] {
  const root: Record<string, any> = {};
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = (file as any).webkitRelativePath || file.name;
    const parts = path.split('/');
    let current = root;
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      if (j === parts.length - 1) {
        current[part] = { __file: true, __path: path };
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  }
  
  function toNodes(obj: Record<string, any>, basePath = ''): FileNode[] {
    return Object.entries(obj)
      .filter(([k]) => !k.startsWith('__'))
      .map(([name, val]) => {
        const path = basePath ? `${basePath}/${name}` : name;
        if (val.__file) {
          return { name, path: val.__path, type: 'file' as const };
        }
        return { name, path, type: 'directory' as const, children: toNodes(val, path) };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }
  
  const nodes = toNodes(root);
  // If there's a single root directory, unwrap it
  if (nodes.length === 1 && nodes[0].type === 'directory' && nodes[0].children) {
    return nodes[0].children;
  }
  return nodes;
}

function FileTreeNode({ node, depth = 0, selectedFiles, onToggle, onToggleDir }: {
  node: FileNode; depth?: number; selectedFiles: Set<string>; onToggle: (path: string) => void; onToggleDir: (node: FileNode) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  if (node.type === 'directory') {
    const allSelected = areAllChildrenSelected(node, selectedFiles);
    const someSelected = !allSelected && collectChildFiles(node).some(p => selectedFiles.has(p));
    return (
      <div>
        <div className="flex items-center gap-0.5 w-full px-1 hover:bg-pink-500/10 text-xs text-pink-200/80"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}>
          <button className="p-0.5" onClick={() => onToggleDir(node)} title={allSelected ? 'Deselect all' : 'Select all'}>
            {allSelected
              ? <CheckSquare className="w-3 h-3 text-pink-400" />
              : someSelected
                ? <CheckSquare className="w-3 h-3 text-pink-400/40" />
                : <Square className="w-3 h-3 text-pink-500/30" />}
          </button>
          <button className="flex items-center gap-1 flex-1 py-1" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronDown className="w-3 h-3 text-pink-400" /> : <ChevronRight className="w-3 h-3 text-pink-400" />}
            <FolderOpen className="w-3 h-3 text-pink-400/70" /><span>{node.name}</span>
          </button>
        </div>
        {expanded && node.children?.map(child => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedFiles={selectedFiles} onToggle={onToggle} onToggleDir={onToggleDir} />
        ))}
      </div>
    );
  }
  const isSelected = selectedFiles.has(node.path);
  return (
    <button className={cn("flex items-center gap-1 w-full px-2 py-1 text-xs hover:bg-pink-500/10",
      isSelected ? 'bg-pink-500/15 text-pink-200' : 'text-pink-200/60'
    )} style={{ paddingLeft: `${depth * 12 + 8}px` }} onClick={() => onToggle(node.path)}>
      {isSelected
        ? <CheckSquare className="w-3 h-3 text-pink-400 shrink-0" />
        : <Square className="w-3 h-3 text-pink-500/30 shrink-0" />}
      <FileText className="w-3 h-3 text-pink-400/50" /><span>{node.name}</span>
    </button>
  );
}

export default function ImproveWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const planContext = (location.state as any)?.plan as ChatMsg[] | undefined;

  const [messages, setMessages] = useState<ChatMsg[]>(planContext || []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [projectTree, setProjectTree] = useState<FileNode[]>(DEFAULT_PROJECT_TREE);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [rightTab, setRightTab] = useState<'files' | 'preview'>('files');
  const [previewHtml, setPreviewHtml] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const toggleDir = useCallback((node: FileNode) => {
    const childPaths = collectChildFiles(node);
    setSelectedFiles(prev => {
      const next = new Set(prev);
      const allSelected = childPaths.every(p => next.has(p));
      if (allSelected) {
        childPaths.forEach(p => next.delete(p));
      } else {
        childPaths.forEach(p => next.add(p));
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allPaths = collectAllFiles(projectTree);
    setSelectedFiles(prev => {
      if (prev.size === allPaths.length) return new Set();
      return new Set(allPaths);
    });
  }, [projectTree]);

  const [streamingContent, setStreamingContent] = useState('');
  const [isPlanMode, setIsPlanMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [convId, setConvId] = useState(() => generateId());
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedFiles, setAppliedFiles] = useState<Set<string>>(new Set());
  const [diffPreview, setDiffPreview] = useState<{ filePath: string; content: string } | null>(null);

  const allCodeBlocks = useMemo(() => {
    const blocks: ParsedCodeBlock[] = [];
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        blocks.push(...parseCodeBlocks(msg.content));
      }
    }
    return blocks;
  }, [messages]);

  // Update live preview when code blocks change
  useEffect(() => {
    if (allCodeBlocks.length > 0) {
      try {
        const projectFiles = allCodeBlocks.map(block => ({
          name: block.filePath.split('/').pop() || block.filePath,
          path: block.filePath,
          content: block.content,
          isDirectory: false,
        }));
        const html = buildPreviewHTML(projectFiles);
        setPreviewHtml(html);
      } catch {
        // Preview build failed, that's okay
      }
    }
  }, [allCodeBlocks]);

  const handleApplyAll = useCallback(async () => {
    if (allCodeBlocks.length === 0) {
      toast.info('No code blocks with file paths found to apply');
      return;
    }
    setIsApplying(true);
    let applied = 0;
    let failed = 0;
    for (const block of allCodeBlocks) {
      try {
        await writeFile(block.filePath, block.content);
        applied++;
        setAppliedFiles(prev => new Set(prev).add(block.filePath));
      } catch {
        failed++;
      }
    }
    setIsApplying(false);
    if (failed === 0) {
      toast.success(`Applied ${applied} file${applied > 1 ? 's' : ''} successfully`);
    } else {
      toast.warning(`Applied ${applied}, failed ${failed}. Make sure a project folder is open.`);
    }
  }, [allCodeBlocks]);

  useEffect(() => { applyModeTheme('ai-improvement'); }, []);

  const loadHistory = useCallback(async () => {
    const all = await getAllConversations();
    setHistory(all.filter(c => c.modeKey === 'ai-improvement'));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleResumeSession = useCallback((conv: Conversation) => {
    const restored: ChatMsg[] = conv.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content }));
    setMessages(restored);
    setConvId(conv.id);
    setActiveConvId(conv.id);
    setShowHistory(false);
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    await deleteConversation(id);
    if (activeConvId === id) {
      setMessages([]);
      setConvId(generateId());
      setActiveConvId(null);
    }
    loadHistory();
  }, [activeConvId, loadHistory]);

  const handleNewSession = useCallback(() => {
    setMessages([]);
    setInput('');
    setConvId(generateId());
    setActiveConvId(null);
    setStreamingContent('');
    setAppliedFiles(new Set());
  }, []);

  // Open Folder via File System Access API
  const handleOpenFolder = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      toast.error('Your browser does not support folder access. Use the Upload button instead.');
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
      setDirHandle(handle);
      toast.loading('Scanning folder...', { id: 'folder-scan' });
      const tree = await scanDirectoryHandle(handle);
      setProjectTree(tree);
      setSelectedFiles(new Set());
      toast.success(`Loaded ${collectAllFiles(tree).length} files from "${handle.name}"`, { id: 'folder-scan' });
    } catch (err: any) {
      if (err.name !== 'AbortError') toast.error('Failed to open folder');
    }
  }, []);

  // Upload folder fallback
  const handleUploadFolder = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const tree = buildTreeFromFileList(files);
    setProjectTree(tree);
    setSelectedFiles(new Set());
    toast.success(`Loaded ${files.length} files`);
  }, []);

  const whisperAvailable = isWhisperLoaded() || getDownloadedModels().length > 0;

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent, scrollToBottom]);

  const handleSend = useCallback(async (overrideInput?: string) => {
    const text = (overrideInput ?? input).trim();
    if (!text || isLoading) return;
    const userMsg: ChatMsg = { id: generateId(), role: 'user', content: text };
    const allMsgsBefore = [...messages, userMsg];
    setMessages(allMsgsBefore);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    try {
      const settings = loadSettings();
      const planPrefix = isPlanMode
        ? `You are in PLANNING MODE. Do NOT write code. Instead outline the improvement plan: what files to change, what approach to take, and what steps are needed. Only produce code when the user says "start building".\n\n`
        : `IMPORTANT: When outputting code changes, always use the format \`\`\`language:/path/to/file.ext with the COMPLETE file contents so the user can apply changes directly.\n\n`;
      const filesContext = selectedFiles.size > 0 ? `\n\nThe user has selected these files for context: ${[...selectedFiles].join(', ')}` : '';
      const systemPrompt = planPrefix + getModeSystemPrompt('ai-improvement') + filesContext;
      const chatMsgs = [
        { role: 'system' as const, content: systemPrompt },
        ...allMsgsBefore.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];
      let fullResponse = '';
      await sendChatMessage(chatMsgs, { ...settings, systemPrompt: '' }, (chunk) => {
        fullResponse += chunk;
        setStreamingContent(prev => prev + chunk);
      });
      const assistantMsg: ChatMsg = { id: generateId(), role: 'assistant', content: fullResponse };
      const allMsgsAfter = [...allMsgsBefore, assistantMsg];
      setMessages(allMsgsAfter);

      const conv: Conversation = {
        id: convId, title: `Improve: ${messages.length === 0 ? text.slice(0, 40) : 'session'}`,
        messages: allMsgsAfter.map(m => ({ ...m, timestamp: Date.now() })),
        createdAt: Date.now(), updatedAt: Date.now(), model: settings.model || 'local', modeKey: 'ai-improvement',
      };
      await saveConversation(conv);
      setActiveConvId(convId);
      loadHistory();

      if (settings.autoPlayTTS && isTTSSupported() && fullResponse) {
        speak(fullResponse, { voice: settings.ttsVoice, rate: settings.ttsRate });
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
  }, [input, messages, isLoading, selectedFiles, isPlanMode, convId]);

  const toggleRecording = useCallback(async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    if (!whisperAvailable) {
      toast.info('Download a Whisper model in Settings → Voice Models');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current = null;
        setIsTranscribing(true);
        try {
          if (!isWhisperLoaded()) await loadWhisperModel(getSelectedWhisperModel());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const ab = await blob.arrayBuffer();
          const ctx = new AudioContext({ sampleRate: 16000 });
          const buf = await ctx.decodeAudioData(ab);
          const text = await transcribeAudio(buf.getChannelData(0));
          if (text.trim()) {
            toast.success(`Heard: "${text.trim().slice(0, 50)}${text.trim().length > 50 ? '…' : ''}"`, { duration: 2000 });
            handleSend(text.trim());
          } else {
            toast.info("Couldn't hear anything. Try again?");
          }
        } catch { toast.error('Transcription failed'); }
        finally { setIsTranscribing(false); }
      };
      mediaRecorder.start();
      setIsRecording(true);
      toast('🎙️ Listening… tap again to stop', { duration: 2000 });
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') { mediaRecorder.stop(); setIsRecording(false); }
      }, 30000);
    } catch { toast.error('Microphone access denied'); }
  }, [isRecording, whisperAvailable, handleSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleApplySingle = useCallback(async (filePath: string, content: string) => {
    try {
      await writeFile(filePath, content);
      setAppliedFiles(prev => new Set(prev).add(filePath));
      toast.success(`Applied to ${filePath}`);
    } catch (err: any) {
      toast.error(`Failed to write ${filePath}: ${err.message}`);
    }
  }, []);

  const renderMarkdown = (content: string) => {
    const parsed = parseCodeBlocks(content);
    return (
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeStr = String(children).replace(/\n$/, '');
            if (match) {
              const matchedBlock = parsed.find(b => b.content.trim() === codeStr.trim());
              const isApplied = matchedBlock ? appliedFiles.has(matchedBlock.filePath) : false;
              return (
                <div className={cn("rounded-lg overflow-hidden", isApplied && "ring-1 ring-emerald-500/30")}>
                  {isApplied && (
                    <div className="h-0.5 bg-gradient-to-r from-emerald-500/60 via-emerald-400/40 to-emerald-500/60" />
                  )}
                  <CodeBlock code={codeStr} language={match[1]} />
                  {matchedBlock && (
                    <div className="flex items-center justify-end px-3 py-1.5 border-t border-border/50" style={{ background: 'hsl(330, 20%, 8%)' }}>
                      <button
                        onClick={() => !isApplied && setDiffPreview({ filePath: matchedBlock.filePath, content: matchedBlock.content })}
                        disabled={isApplied}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-mono transition-colors",
                          isApplied
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default"
                            : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25 hover:text-emerald-200"
                        )}
                      >
                        {isApplied ? (
                          <><Check className="w-3 h-3" /> Applied</>
                        ) : (
                          <><FileCode className="w-3 h-3" /> Apply → {matchedBlock.filePath.split('/').pop()}</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-pink-900/50 text-pink-200 text-xs font-mono" {...props}>
                {children}
              </code>
            );
          },
          p({ children }) { return <p className="mb-2 last:mb-0">{children}</p>; },
          ul({ children }) { return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>; },
          ol({ children }) { return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>; },
          h1({ children }) { return <h1 className="text-lg font-bold mb-2 text-pink-200">{children}</h1>; },
          h2({ children }) { return <h2 className="text-base font-bold mb-2 text-pink-200">{children}</h2>; },
          h3({ children }) { return <h3 className="text-sm font-bold mb-1 text-pink-200">{children}</h3>; },
          strong({ children }) { return <strong className="font-semibold text-pink-100">{children}</strong>; },
          blockquote({ children }) { return <blockquote className="border-l-2 border-pink-500/40 pl-3 italic text-pink-300/80 mb-2">{children}</blockquote>; },
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  const allFiles = useMemo(() => collectAllFiles(projectTree), [projectTree]);
  const allSelected = allFiles.length > 0 && selectedFiles.size === allFiles.length;

  return (
    <div className="h-screen flex flex-col" style={{ background: 'hsl(330, 20%, 6%)' }}>
      {/* Hidden upload input */}
      <input
        ref={uploadRef}
        type="file"
        className="hidden"
        {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
        onChange={handleUploadFolder}
      />

      {/* Header */}
      <header className="h-12 flex items-center justify-between px-3 border-b shrink-0" style={{
        background: 'linear-gradient(180deg, hsl(330, 40%, 14%) 0%, hsl(330, 40%, 9%) 100%)',
        borderColor: 'hsl(330, 30%, 22%)',
      }}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8 text-pink-300 hover:text-pink-100">
            <Home className="h-4 w-4" />
          </Button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-pink-200 text-sm">AI Improvement</span>
            <span className="text-[10px] text-pink-500/60 ml-2 hidden sm:inline">Talk to improve your app</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {allCodeBlocks.length > 0 && (
            <Button
              variant="ghost" size="sm"
              className="h-7 text-xs gap-1 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-200 border border-emerald-500/20"
              onClick={handleApplyAll}
              disabled={isApplying}
            >
              {isApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
              Apply All ({allCodeBlocks.length})
            </Button>
          )}
          <Button
            variant="ghost" size="sm"
            className={cn("h-7 text-xs gap-1", showHistory ? "bg-pink-500/20 text-pink-200" : "text-pink-400 hover:text-pink-200")}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="w-3 h-3" />
            History
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-pink-400 hover:text-pink-200" onClick={handleNewSession}>
            <Plus className="w-3 h-3" /> New
          </Button>
          <Button
            variant="ghost" size="sm"
            className={cn("h-7 text-xs gap-1", isPlanMode ? "bg-amber-500/20 text-amber-300" : "text-pink-400 hover:text-pink-200")}
            onClick={() => setIsPlanMode(!isPlanMode)}
          >
            <Lightbulb className="w-3 h-3" />
            {isPlanMode ? 'Planning' : 'Plan'}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* History Sidebar */}
        {showHistory && (
          <div className="w-56 shrink-0 border-r flex flex-col" style={{
            background: 'hsl(330, 25%, 7%)',
            borderColor: 'hsl(330, 30%, 16%)',
          }}>
            <div className="h-9 flex items-center justify-between px-3 border-b shrink-0" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
              <span className="text-xs font-semibold text-pink-300">Sessions</span>
              <span className="text-[10px] text-pink-500/50">{history.length}</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-1.5 space-y-0.5">
                {history.length === 0 ? (
                  <p className="text-[11px] text-pink-500/40 text-center py-6">No previous sessions</p>
                ) : (
                  history.map(conv => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors",
                        activeConvId === conv.id ? "bg-pink-500/15 text-pink-200" : "text-pink-300/60 hover:bg-pink-500/8 hover:text-pink-200"
                      )}
                      onClick={() => handleResumeSession(conv)}
                    >
                      <Sparkles className="w-3 h-3 shrink-0 text-pink-400/40" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{conv.title.replace('Improve: ', '')}</p>
                        <p className="text-[10px] text-pink-500/40">
                          {new Date(conv.updatedAt).toLocaleDateString()} · {conv.messages.length} msgs
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSession(conv.id); }}
                        className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-pink-500/20 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3 text-pink-400/60" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Chat Panel */}
        <ResizablePanel defaultSize={55} minSize={35}>
          <div className="h-full flex flex-col">
            <ScrollArea className="flex-1" ref={scrollRef}>
              <div className="p-4 space-y-4">
                {messages.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-600/20 flex items-center justify-center mb-4 border border-pink-500/20">
                      <Sparkles className="w-8 h-8 text-pink-400/60" />
                    </div>
                    <h2 className="text-lg font-semibold text-pink-200 mb-1">What should we improve?</h2>
                    <p className="text-sm text-pink-400/50 mb-6 text-center max-w-sm">
                      Just tell me what to fix — or tap the mic and talk. I'll analyze your code and suggest changes.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full max-w-lg">
                      {QUICK_SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
                        <button
                          key={label}
                          onClick={() => handleSend(prompt)}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-pink-200/80 
                            bg-pink-950/40 border border-pink-800/20 hover:border-pink-500/40 
                            hover:bg-pink-900/30 transition-all group text-left"
                        >
                          <Icon className="w-4 h-4 text-pink-400/60 group-hover:text-pink-300 shrink-0" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-6 flex items-center gap-2 text-[11px] text-pink-500/40">
                      <Mic className="w-3 h-3" />
                      <span>Or hold the mic button and describe what to improve</span>
                    </div>
                  </div>
                )}

                {messages.map(msg => (
                  <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[88%] rounded-2xl px-4 py-3 text-sm',
                      msg.role === 'user'
                        ? 'bg-pink-600/80 text-white rounded-br-md'
                        : 'bg-pink-950/40 border border-pink-800/25 text-pink-100 rounded-bl-md'
                    )}>
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm prose-invert max-w-none">
                          {renderMarkdown(msg.content)}
                        </div>
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                  </div>
                ))}

                {streamingContent && (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-2xl rounded-bl-md px-4 py-3 text-sm bg-pink-950/40 border border-pink-800/25 text-pink-100">
                      <div className="prose prose-sm prose-invert max-w-none">
                        {renderMarkdown(streamingContent)}
                      </div>
                    </div>
                  </div>
                )}

                {isLoading && !streamingContent && (
                  <div className="flex justify-start">
                    <div className="bg-pink-950/40 border border-pink-800/25 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
                      <span className="text-xs text-pink-400/60">Analyzing your code…</span>
                    </div>
                  </div>
                )}

                {!isLoading && !streamingContent && allCodeBlocks.length > 0 && (
                  <div className="rounded-xl border overflow-hidden" style={{
                    background: 'hsl(330, 25%, 8%)',
                    borderColor: 'hsl(330, 30%, 18%)',
                  }}>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-semibold text-pink-200">
                          {allCodeBlocks.length} fix{allCodeBlocks.length > 1 ? 'es' : ''} ready
                        </span>
                        <span className="text-[10px] text-pink-500/50">
                          {appliedFiles.size}/{allCodeBlocks.length} applied
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                        onClick={handleApplyAll}
                        disabled={isApplying || appliedFiles.size === allCodeBlocks.length}
                      >
                        {isApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                        {appliedFiles.size === allCodeBlocks.length ? 'All Applied' : 'Fix All'}
                      </Button>
                    </div>
                    <div className="divide-y" style={{ borderColor: 'hsl(330, 30%, 14%)' }}>
                      {allCodeBlocks.map((block, idx) => {
                        const isBlockApplied = appliedFiles.has(block.filePath);
                        return (
                          <div key={idx} className="flex items-center justify-between px-4 py-2 hover:bg-pink-500/5 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileCode className="w-3.5 h-3.5 text-pink-400/60 shrink-0" />
                              <span className="text-xs font-mono text-pink-200/80 truncate">{block.filePath}</span>
                              <span className="text-[10px] text-pink-500/40 shrink-0">{block.language}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <Button
                                variant="ghost" size="sm"
                                className="h-6 text-[10px] px-2 text-pink-300 hover:text-pink-100 hover:bg-pink-500/15"
                                onClick={() => setDiffPreview({ filePath: block.filePath, content: block.content })}
                                disabled={isBlockApplied}
                              >Diff</Button>
                              <Button
                                size="sm"
                                className={cn(
                                  "h-6 text-[10px] px-2.5 gap-1",
                                  isBlockApplied
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default hover:bg-emerald-500/20"
                                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                                )}
                                onClick={() => !isBlockApplied && handleApplySingle(block.filePath, block.content)}
                                disabled={isBlockApplied}
                              >
                                {isBlockApplied ? <><Check className="w-3 h-3" /> Done</> : 'Apply'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {/* Input area */}
            <div className="p-3 border-t shrink-0" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
              {selectedFiles.size > 0 && (
                <div className="flex items-center gap-1 mb-2 px-1 flex-wrap">
                  <FileText className="w-3 h-3 text-pink-400/50 shrink-0" />
                  <span className="text-[10px] text-pink-400/60">{selectedFiles.size} file{selectedFiles.size > 1 ? 's' : ''} selected</span>
                  <button onClick={() => setSelectedFiles(new Set())} className="text-[10px] text-pink-500/40 hover:text-pink-400 ml-1 flex items-center gap-0.5">
                    <X className="w-3 h-3" /> clear
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isPlanMode ? "Describe what to plan…" : "Tell me what to improve…"}
                  className="min-h-[42px] max-h-[120px] resize-none flex-1 bg-pink-950/30 border-pink-800/30 text-pink-100 placeholder:text-pink-500/40 rounded-xl"
                  rows={1}
                />
                <Button
                  onClick={toggleRecording}
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "shrink-0 h-[42px] w-[42px] rounded-xl transition-all",
                    isRecording ? "bg-red-500/20 text-red-400 animate-pulse border border-red-500/30"
                      : isTranscribing ? "text-pink-400"
                        : whisperAvailable ? "text-pink-400 hover:bg-pink-500/10 hover:text-pink-300"
                          : "text-pink-600 hover:text-pink-500"
                  )}
                  disabled={isTranscribing}
                  title={isRecording ? 'Stop recording' : whisperAvailable ? 'Voice input (auto-sends)' : 'Set up voice model first'}
                >
                  {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
                <Button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="shrink-0 h-[42px] w-[42px] rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-30"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel: Files + Preview Tabs */}
        <ResizablePanel defaultSize={45} minSize={20}>
          <div className="h-full flex flex-col" style={{ background: 'hsl(330, 20%, 5%)' }}>
            <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as 'files' | 'preview')} className="flex flex-col h-full">
              <div className="flex items-center border-b shrink-0" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
                <TabsList className="h-9 bg-transparent border-0 p-0 gap-0">
                  <TabsTrigger value="files" className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-pink-500 data-[state=active]:bg-transparent text-xs px-3 text-pink-300 data-[state=active]:text-pink-200">
                    <FolderOpen className="w-3 h-3 mr-1.5" /> Files
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-pink-500 data-[state=active]:bg-transparent text-xs px-3 text-pink-300 data-[state=active]:text-pink-200">
                    <Eye className="w-3 h-3 mr-1.5" /> Preview
                  </TabsTrigger>
                </TabsList>
                <div className="ml-auto flex items-center gap-1 pr-2">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-pink-400 hover:text-pink-200" onClick={handleOpenFolder} title="Open folder (File System Access API)">
                    <FolderOpen className="w-3 h-3 mr-1" /> Open
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-pink-400 hover:text-pink-200" onClick={() => uploadRef.current?.click()} title="Upload folder">
                    <Upload className="w-3 h-3 mr-1" /> Upload
                  </Button>
                </div>
              </div>

              <TabsContent value="files" className="flex-1 m-0 overflow-hidden flex flex-col">
                {/* Select All bar */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0" style={{ borderColor: 'hsl(330, 30%, 14%)' }}>
                  <button className="flex items-center gap-1.5 text-xs text-pink-300 hover:text-pink-100 transition-colors" onClick={toggleSelectAll}>
                    {allSelected
                      ? <CheckSquare className="w-3.5 h-3.5 text-pink-400" />
                      : <Square className="w-3.5 h-3.5 text-pink-500/40" />}
                    <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                  </button>
                  <span className="text-[10px] text-pink-500/50 font-mono">{selectedFiles.size}/{allFiles.length}</span>
                </div>
                <ScrollArea className="flex-1 py-1">
                  {projectTree.map(node => (
                    <FileTreeNode key={node.path} node={node} selectedFiles={selectedFiles} onToggle={toggleFile} onToggleDir={toggleDir} />
                  ))}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
                {previewHtml ? (
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts"
                    title="Live Preview"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-pink-500/40">
                    <Eye className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-xs">Preview will appear when the AI generates code changes</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      </div>

      {diffPreview && (
        <DiffPreview
          open={!!diffPreview}
          onOpenChange={(open) => !open && setDiffPreview(null)}
          filePath={diffPreview.filePath}
          newContent={diffPreview.content}
          onApply={() => handleApplySingle(diffPreview.filePath, diffPreview.content)}
        />
      )}
    </div>
  );
}
