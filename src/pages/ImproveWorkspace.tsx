import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Sparkles, FileText, FolderOpen, ChevronRight, ChevronDown,
  RefreshCw, Loader2, Lightbulb, Mic, MicOff, Send, Wand2, Zap,
  Shield, Palette, Bug, Gauge, ArrowDown, History, Plus, Trash2, PanelLeftClose, PanelLeft,
  CheckSquare, Square, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
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

interface FileNode { name: string; path: string; type: 'file' | 'directory'; children?: FileNode[]; }
interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; }

const PROJECT_TREE: FileNode[] = [
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
  { icon: Bug, label: 'Fix bugs', prompt: 'Scan the codebase for potential bugs and fix them. Focus on runtime errors, edge cases, and null checks.' },
  { icon: Gauge, label: 'Optimize performance', prompt: 'Analyze the app for performance bottlenecks and suggest optimizations. Focus on rendering, bundle size, and memory leaks.' },
  { icon: Shield, label: 'Improve security', prompt: 'Review the codebase for security vulnerabilities and suggest fixes. Check for XSS, injection, and auth issues.' },
  { icon: Palette, label: 'Polish UI/UX', prompt: 'Review the UI for usability improvements. Focus on accessibility, responsive design, and visual consistency.' },
  { icon: Zap, label: 'Add features', prompt: 'What are the most impactful features we could add next? Consider user experience, technical feasibility, and value.' },
  { icon: Wand2, label: 'Refactor code', prompt: 'Identify areas of the codebase that need refactoring. Focus on code duplication, complexity, and maintainability.' },
];

function FileTreeNode({ node, depth = 0, selectedFiles, onToggle }: {
  node: FileNode; depth?: number; selectedFiles: Set<string>; onToggle: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  if (node.type === 'directory') {
    return (
      <div>
        <button className="flex items-center gap-1 w-full px-2 py-1 hover:bg-pink-500/10 text-xs text-pink-200/80"
          style={{ paddingLeft: `${depth * 12 + 8}px` }} onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="w-3 h-3 text-pink-400" /> : <ChevronRight className="w-3 h-3 text-pink-400" />}
          <FolderOpen className="w-3 h-3 text-pink-400/70" /><span>{node.name}</span>
        </button>
        {expanded && node.children?.map(child => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedFiles={selectedFiles} onToggle={onToggle} />
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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isPlanMode, setIsPlanMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [convId, setConvId] = useState(() => generateId());
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { applyModeTheme('ai-improvement'); }, []);

  // Load history on mount and after saves
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
        : '';
      const systemPrompt = planPrefix + getModeSystemPrompt('ai-improvement') +
        (selectedFile ? `\n\nThe user is currently viewing: ${selectedFile}` : '');
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
  }, [input, messages, isLoading, selectedFile, isPlanMode, convId]);

  const toggleRecording = useCallback(async () => {
    // If already recording, stop it
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
            // Auto-send after voice transcription for hands-free experience
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
      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') { mediaRecorder.stop(); setIsRecording(false); }
      }, 30000);
    } catch { toast.error('Microphone access denied'); }
  }, [isRecording, whisperAvailable, handleSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const renderMarkdown = (content: string) => (
    <ReactMarkdown
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeStr = String(children).replace(/\n$/, '');
          if (match) {
            return <CodeBlock code={codeStr} language={match[1]} />;
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

  return (
    <div className="h-screen flex flex-col" style={{ background: 'hsl(330, 20%, 6%)' }}>
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
          <Button
            variant="ghost" size="sm"
            className={cn("h-7 text-xs gap-1", showHistory ? "bg-pink-500/20 text-pink-200" : "text-pink-400 hover:text-pink-200")}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="w-3 h-3" />
            History
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs gap-1 text-pink-400 hover:text-pink-200"
            onClick={handleNewSession}
          >
            <Plus className="w-3 h-3" />
            New
          </Button>
          <Button
            variant="ghost" size="sm"
            className={cn("h-7 text-xs gap-1", isPlanMode ? "bg-amber-500/20 text-amber-300" : "text-pink-400 hover:text-pink-200")}
            onClick={() => setIsPlanMode(!isPlanMode)}
          >
            <Lightbulb className="w-3 h-3" />
            {isPlanMode ? 'Planning' : 'Plan'}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-pink-400 hover:text-pink-200 gap-1">
            <RefreshCw className="w-3 h-3" />Rescan
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* History Sidebar */}
        {showHistory && (
          <div className="w-64 shrink-0 border-r flex flex-col" style={{
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
                        activeConvId === conv.id
                          ? "bg-pink-500/15 text-pink-200"
                          : "text-pink-300/60 hover:bg-pink-500/8 hover:text-pink-200"
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
                {/* Empty State */}
                {messages.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-600/20 flex items-center justify-center mb-4 border border-pink-500/20">
                      <Sparkles className="w-8 h-8 text-pink-400/60" />
                    </div>
                    <h2 className="text-lg font-semibold text-pink-200 mb-1">What should we improve?</h2>
                    <p className="text-sm text-pink-400/50 mb-6 text-center max-w-sm">
                      Just tell me what to fix — or tap the mic and talk. I'll analyze your code and suggest changes.
                    </p>

                    {/* Quick Actions Grid */}
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

                    {/* Voice hint */}
                    <div className="mt-6 flex items-center gap-2 text-[11px] text-pink-500/40">
                      <Mic className="w-3 h-3" />
                      <span>Or hold the mic button and describe what to improve</span>
                    </div>
                  </div>
                )}

                {/* Messages */}
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

                {/* Streaming response */}
                {streamingContent && (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-2xl rounded-bl-md px-4 py-3 text-sm bg-pink-950/40 border border-pink-800/25 text-pink-100">
                      <div className="prose prose-sm prose-invert max-w-none">
                        {renderMarkdown(streamingContent)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading indicator */}
                {isLoading && !streamingContent && (
                  <div className="flex justify-start">
                    <div className="bg-pink-950/40 border border-pink-800/25 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
                      <span className="text-xs text-pink-400/60">Analyzing your code…</span>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {/* Input area */}
            <div className="p-3 border-t shrink-0" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
              {selectedFile && (
                <div className="flex items-center gap-1 mb-2 px-1">
                  <FileText className="w-3 h-3 text-pink-400/50" />
                  <span className="text-[10px] text-pink-400/60 font-mono">{selectedFile}</span>
                  <button onClick={() => setSelectedFile(null)} className="text-[10px] text-pink-500/40 hover:text-pink-400 ml-1">✕</button>
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
                {/* Voice button */}
                <Button
                  onClick={toggleRecording}
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "shrink-0 h-[42px] w-[42px] rounded-xl transition-all",
                    isRecording
                      ? "bg-red-500/20 text-red-400 animate-pulse border border-red-500/30"
                      : isTranscribing
                        ? "text-pink-400"
                        : whisperAvailable
                          ? "text-pink-400 hover:bg-pink-500/10 hover:text-pink-300"
                          : "text-pink-600 hover:text-pink-500"
                  )}
                  disabled={isTranscribing}
                  title={isRecording ? 'Stop recording' : whisperAvailable ? 'Voice input (auto-sends)' : 'Set up voice model first'}
                >
                  {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
                {/* Send button */}
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

        {/* File Tree Panel */}
        <ResizablePanel defaultSize={45} minSize={20}>
          <div className="h-full flex flex-col" style={{ background: 'hsl(330, 20%, 5%)' }}>
            <div className="h-9 flex items-center px-3 border-b shrink-0" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
              <FolderOpen className="w-3.5 h-3.5 text-pink-400 mr-2" />
              <span className="text-xs font-mono text-pink-300">Project Source</span>
              {selectedFile && <span className="ml-auto text-[10px] text-pink-500 font-mono truncate max-w-[200px]">{selectedFile}</span>}
            </div>
            <ScrollArea className="flex-1 py-1">
              {PROJECT_TREE.map(node => (
                <FileTreeNode key={node.path} node={node} selectedPath={selectedFile} onSelect={setSelectedFile} />
              ))}
            </ScrollArea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      </div>
    </div>
  );
}
