import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Sparkles, FileText, FolderOpen, ChevronRight, ChevronDown, RefreshCw, Loader2, Lightbulb, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { applyModeTheme, getModeSystemPrompt } from '@/lib/mode-themes';
import { sendChatMessage, loadSettings } from '@/lib/chat-api';
import { speak, isTTSSupported } from '@/lib/tts';
import { generateId } from '@/lib/ide-store';
import { saveConversation, Conversation } from '@/lib/db';
import { cn } from '@/lib/utils';
import { isWhisperLoaded, getDownloadedModels, transcribeAudio, loadWhisperModel, getSelectedWhisperModel } from '@/lib/local-stt';
import { toast } from 'sonner';

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

function FileTreeNode({ node, depth = 0, selectedPath, onSelect }: {
  node: FileNode; depth?: number; selectedPath: string | null; onSelect: (path: string) => void;
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
          <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    );
  }
  return (
    <button className={cn("flex items-center gap-1 w-full px-2 py-1 text-xs hover:bg-pink-500/10",
      selectedPath === node.path ? 'bg-pink-500/15 text-pink-200' : 'text-pink-200/60'
    )} style={{ paddingLeft: `${depth * 12 + 8}px` }} onClick={() => onSelect(node.path)}>
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
  const [convId] = useState(() => generateId());

  useState(() => { applyModeTheme('ai-improvement'); });

  const whisperAvailable = isWhisperLoaded() || getDownloadedModels().length > 0;

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: ChatMsg = { id: generateId(), role: 'user', content: input.trim() };
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
      await sendChatMessage(chatMsgs, { ...settings, systemPrompt: '' }, (chunk) => { fullResponse += chunk; setStreamingContent(prev => prev + chunk); });
      const assistantMsg: ChatMsg = { id: generateId(), role: 'assistant', content: fullResponse };
      const allMsgsAfter = [...allMsgsBefore, assistantMsg];
      setMessages(allMsgsAfter);

      // Persist to IndexedDB
      const conv: Conversation = {
        id: convId, title: `Improve: ${messages.length === 0 ? input.trim().slice(0, 40) : 'session'}`,
        messages: allMsgsAfter.map(m => ({ ...m, timestamp: Date.now() })),
        createdAt: Date.now(), updatedAt: Date.now(), model: settings.model || 'local', modeKey: 'ai-improvement',
      };
      await saveConversation(conv);
      // TTS auto-play
      if (settings.autoPlayTTS && isTTSSupported() && fullResponse) {
        speak(fullResponse, { voice: settings.ttsVoice, rate: settings.ttsRate });
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
  }, [input, messages, isLoading, selectedFile, isPlanMode]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) return;
    if (!whisperAvailable) {
      toast.info('Download a Whisper model in Settings → Voice Models');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsTranscribing(true);
        try {
          if (!isWhisperLoaded()) await loadWhisperModel(getSelectedWhisperModel());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const ab = await blob.arrayBuffer();
          const ctx = new AudioContext({ sampleRate: 16000 });
          const buf = await ctx.decodeAudioData(ab);
          const text = await transcribeAudio(buf.getChannelData(0));
          if (text.trim()) setInput(prev => prev + (prev ? ' ' : '') + text.trim());
        } catch { toast.error('Transcription failed'); }
        finally { setIsTranscribing(false); }
      };
      mediaRecorder.start();
      setIsRecording(true);
      toast.success('Recording...', { duration: 1500 });
      setTimeout(() => { if (mediaRecorder.state === 'recording') { mediaRecorder.stop(); setIsRecording(false); } }, 10000);
    } catch { toast.error('Failed to access microphone'); }
  }, [isRecording, whisperAvailable]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: 'hsl(330, 20%, 6%)' }}>
      <header className="h-12 flex items-center justify-between px-3 border-b" style={{
        background: 'linear-gradient(180deg, hsl(330, 40%, 14%) 0%, hsl(330, 40%, 9%) 100%)',
        borderColor: 'hsl(330, 30%, 22%)',
      }}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8 text-pink-300 hover:text-pink-100"><Home className="h-4 w-4" /></Button>
          <Sparkles className="w-5 h-5 text-pink-400" />
          <span className="font-bold text-pink-300 text-sm">AI Improvement</span>
          <span className="text-[10px] text-pink-500/60 ml-2">Self-modification workspace</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 text-xs text-pink-400 hover:text-pink-200">
            <RefreshCw className="w-3 h-3 mr-1" />Rescan Files
          </Button>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="h-full flex flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-12 text-pink-400/40">
                    <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Describe what to improve about LocalDev AI</p>
                    <p className="text-xs mt-1">Select files from the tree to give context</p>
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
                      msg.role === 'user' ? 'bg-pink-600/80 text-white rounded-br-md' : 'bg-pink-950/50 border border-pink-800/30 text-pink-100 rounded-bl-md'
                    )}>{msg.content}</div>
                  </div>
                ))}
                {streamingContent && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 text-sm whitespace-pre-wrap bg-pink-950/50 border border-pink-800/30 text-pink-100">{streamingContent}</div>
                  </div>
                )}
                {isLoading && !streamingContent && (
                  <div className="flex justify-start"><div className="bg-pink-950/50 border border-pink-800/30 rounded-2xl rounded-bl-md px-4 py-3"><Loader2 className="w-4 h-4 animate-spin text-pink-400" /></div></div>
                )}
              </div>
            </ScrollArea>
            <div className="p-3 border-t" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
              <div className="flex gap-2">
                <Textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={isPlanMode ? "Describe what to plan..." : "Suggest an improvement..."}
                  className="min-h-[40px] max-h-[100px] resize-none flex-1 bg-pink-950/30 border-pink-800/30 text-pink-100 placeholder:text-pink-500/40" rows={1} />
                <Button onClick={toggleRecording} size="icon" variant="ghost"
                  className={cn("shrink-0", isRecording ? "text-red-400 animate-pulse" : isTranscribing ? "text-pink-400" : whisperAvailable ? "text-pink-400" : "text-pink-600")}
                  disabled={isTranscribing}>
                  {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
                <Button onClick={() => setIsPlanMode(!isPlanMode)} size="icon" variant={isPlanMode ? "default" : "ghost"}
                  className={cn(isPlanMode ? "bg-amber-500/90 hover:bg-amber-500 text-white" : "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10")}
                  title={isPlanMode ? "Planning mode ON" : "Toggle planning mode"}>
                  <Lightbulb className="w-4 h-4" />
                </Button>
                <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon" className="bg-pink-600 hover:bg-pink-500">
                  <Sparkles className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="h-full flex flex-col" style={{ background: 'hsl(330, 20%, 5%)' }}>
            <div className="h-8 flex items-center px-3 border-b" style={{ borderColor: 'hsl(330, 30%, 16%)' }}>
              <FolderOpen className="w-3.5 h-3.5 text-pink-400 mr-2" />
              <span className="text-xs font-mono text-pink-300">Project Source</span>
              {selectedFile && <span className="ml-auto text-[10px] text-pink-500 font-mono">{selectedFile}</span>}
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
  );
}
