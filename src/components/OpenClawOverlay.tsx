import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { 
  MessageSquare, X, Minimize2, Maximize2, Mic, MicOff, Volume2, VolumeX,
  Send, Loader2, Terminal, FileText, Zap, Settings, ArrowRight, Code2,
  Wrench, Navigation, Hammer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useOpenClaw } from '@/hooks/use-openclaw';
import { isWhisperLoaded, transcribeAudio, loadWhisperModel, getSelectedWhisperModel, getDownloadedModels } from '@/lib/local-stt';
import { speak, stopSpeaking, isTTSSupported } from '@/lib/tts';
import { sendToIDE, sendToChat, navigateTo, applyCodeToIDE } from '@/lib/openclaw-bridge';
import { parseCodeBlocks } from '@/lib/code-parser';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface OpenClawConfig {
  model?: string;
  autoBackup?: boolean;
  learningEnabled?: boolean;
  murmurUpdates?: boolean;
}

interface TTSSettings {
  voice?: string;
  rate?: number;
}

interface OpenClawOverlayProps {
  onClose: () => void;
  onOpenSettings: () => void;
  config?: OpenClawConfig;
  ttsSettings?: TTSSettings;
}

export function OpenClawOverlay({ onClose, onOpenSettings, config, ttsSettings }: OpenClawOverlayProps) {
  const {
    state, logs, murmur, history, streamingContent, suggestions,
    init, shutdown, chat, execute, updateSuggestions, clearHistory,
  } = useOpenClaw();

  const [input, setInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [whisperReady, setWhisperReady] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    init({ 
      model: config?.model || 'llama3.1:8b',
      autoBackup: config?.autoBackup ?? true,
      learningEnabled: config?.learningEnabled ?? true,
      murmurUpdates: config?.murmurUpdates ?? true,
      sandboxedPath: null,
    });
    const checkWhisper = () => {
      setWhisperReady(isWhisperLoaded() || getDownloadedModels().length > 0);
    };
    checkWhisper();
    return () => { shutdown(); };
  }, [config?.model, config?.autoBackup, config?.learningEnabled, config?.murmurUpdates]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, streamingContent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'X') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => { updateSuggestions(input); }, [input, updateSuggestions]);

  // Dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y)),
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, dragOffset]);

  // Voice recording
  const startRecording = useCallback(async () => {
    if (!micEnabled || !whisperReady) { if (!whisperReady) toast.info('Download a Whisper model in Settings first'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeRecording(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch { toast.error('Failed to access microphone'); }
  }, [micEnabled, whisperReady]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); }
  }, [isRecording]);

  const transcribeRecording = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const downloadedModels = getDownloadedModels();
      if (downloadedModels.length === 0) { toast.error('No Whisper model downloaded.'); setIsTranscribing(false); return; }
      if (!isWhisperLoaded()) {
        toast.loading('Loading Whisper model...', { id: 'whisper-load' });
        const loaded = await loadWhisperModel(getSelectedWhisperModel());
        toast.dismiss('whisper-load');
        if (!loaded) { toast.error('Failed to load Whisper model'); setIsTranscribing(false); return; }
      }
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const audioData = audioBuffer.getChannelData(0);
      await audioContext.close();
      const text = await transcribeAudio(audioData);
      if (text.trim()) { setInput(prev => prev + (prev ? ' ' : '') + text.trim()); toast.success('Transcribed!'); }
      else toast.info('No speech detected');
    } catch (error) {
      console.error('Transcription error:', error);
      toast.error(error instanceof Error ? error.message : 'Transcription failed');
    } finally { setIsTranscribing(false); }
  };

  // Push-to-talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement !== textareaRef.current && !e.repeat) { e.preventDefault(); startRecording(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isRecording) { e.preventDefault(); stopRecording(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [isRecording, startRecording, stopRecording]);

  // Submit
  const handleSubmit = async () => {
    if (!input.trim() || state.isProcessing) return;
    const message = input.trim();
    setInput('');
    await chat(message);
    if (speakerEnabled && isTTSSupported() && history.length > 0) {
      const lastAssistant = history.filter(m => m.role === 'assistant').pop();
      if (lastAssistant) speak(lastAssistant.content, { voice: ttsSettings?.voice, rate: ttsSettings?.rate ?? 1.0 });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const selectSuggestion = (suggestion: string) => { setInput(suggestion); textareaRef.current?.focus(); };

  // --- ACTION HANDLERS ---

  // Get the last assistant response
  const getLastResponse = (): string | null => {
    const assistantMsgs = history.filter(m => m.role === 'assistant');
    return assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1].content : null;
  };

  // Send last response's code to the App Builder
  const handleSendToAppBuilder = () => {
    const lastResponse = getLastResponse();
    if (!lastResponse) { toast.info('No response to send'); return; }
    console.log('[OpenClaw] Parsing response for code blocks:', lastResponse.substring(0, 300));
    const codeBlocks = parseCodeBlocks(lastResponse);
    console.log('[OpenClaw] Found code blocks:', codeBlocks.length, codeBlocks.map(b => b.filePath));
    if (codeBlocks.length > 0) {
      codeBlocks.forEach(block => applyCodeToIDE(block.content, block.filePath));
      toast.success(`Sent ${codeBlocks.length} file(s) to App Builder`);
    } else {
      sendToIDE(lastResponse);
      toast.success('Sent response to App Builder chat');
    }
    navigateTo('/ide');
    setShowActions(false);
  };

  // Send last response to main chat
  const handleSendToChat = () => {
    const lastResponse = getLastResponse();
    if (!lastResponse) { toast.info('No response to send'); return; }
    sendToChat(lastResponse);
    toast.success('Sent to main chat');
    setShowActions(false);
  };

  // Open App Builder
  const handleOpenAppBuilder = () => {
    navigateTo('/ide');
    toast.success('Opening App Builder...');
    setShowActions(false);
  };

  // Quick fix: ask OpenClaw to fix App Builder issues
  const handleFixAppBuilder = () => {
    setInput('Look at the current App Builder project and fix any errors or issues you find. Check for broken imports, missing files, and code that doesn\'t compile.');
    textareaRef.current?.focus();
    setShowActions(false);
  };

  // Quick action: generate code
  const handleGenerateCode = () => {
    setInput('Write the code for: ');
    textareaRef.current?.focus();
    setShowActions(false);
  };

  // Quick action: edit a file
  const handleEditFile = () => {
    setInput('Edit the file at path: ');
    textareaRef.current?.focus();
    setShowActions(false);
  };

  if (isMinimized) {
    return (
      <div ref={overlayRef} className="fixed z-[9999] cursor-pointer" style={{ left: position.x, top: position.y }}
        onClick={() => setIsMinimized(false)}>
        <div className="relative">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/70 shadow-lg flex items-center justify-center hover:scale-105 transition-transform">
            <Zap className="w-6 h-6 text-primary-foreground" />
          </div>
          {state.isProcessing && <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full animate-pulse" />}
          {murmur && <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-secondary/90 text-xs px-2 py-1 rounded">{murmur}</div>}
        </div>
      </div>
    );
  }

  return (
    <div ref={overlayRef}
      className={cn(
        "fixed z-[9999] bg-sidebar/95 backdrop-blur-lg border border-sidebar-border rounded-xl shadow-2xl overflow-hidden flex flex-col",
        isExpanded ? "w-[600px] h-[80vh]" : "w-[400px] h-[520px]",
        isDragging && "cursor-grabbing"
      )}
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-sidebar-accent border-b border-sidebar-border cursor-grab"
        onMouseDown={handleMouseDown}>
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">OpenClaw</span>
          <Badge variant="outline" className={cn("text-xs", state.isActive ? "text-green-500 border-green-500/50" : "text-yellow-500 border-yellow-500/50")}>
            {state.isActive ? 'Active' : 'Offline'}
          </Badge>
        </div>
        <div className="flex items-center gap-1 no-drag">
          <Button variant="ghost" size="icon" className={cn("h-7 w-7", showActions && "bg-primary/20")} onClick={() => setShowActions(!showActions)} title="Quick Actions">
            <Hammer className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowLogs(!showLogs)}><FileText className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(true)}><MessageSquare className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Quick Actions Panel */}
      {showActions && (
        <div className="px-3 py-2 bg-sidebar-accent/80 border-b border-sidebar-border space-y-1.5 no-drag">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Quick Actions</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5 justify-start" onClick={handleSendToAppBuilder}>
              <ArrowRight className="w-3 h-3" /> Send to App Builder
            </Button>
            <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5 justify-start" onClick={handleSendToChat}>
              <MessageSquare className="w-3 h-3" /> Send to Chat
            </Button>
            <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5 justify-start" onClick={handleOpenAppBuilder}>
              <Navigation className="w-3 h-3" /> Open App Builder
            </Button>
            <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5 justify-start" onClick={handleFixAppBuilder}>
              <Wrench className="w-3 h-3" /> Fix App Builder
            </Button>
            <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5 justify-start" onClick={handleGenerateCode}>
              <Code2 className="w-3 h-3" /> Generate Code
            </Button>
            <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5 justify-start" onClick={handleEditFile}>
              <FileText className="w-3 h-3" /> Edit File
            </Button>
          </div>
        </div>
      )}

      {/* Privacy toggles */}
      <div className="flex items-center justify-between px-4 py-2 bg-sidebar-accent/50 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Button variant={micEnabled ? "secondary" : "ghost"} size="sm" className="h-7 gap-1" onClick={() => setMicEnabled(!micEnabled)}>
            {micEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
            <span className="text-xs">{micEnabled ? 'Mic On' : 'Muted'}</span>
          </Button>
          <Button variant={speakerEnabled ? "secondary" : "ghost"} size="sm" className="h-7 gap-1" onClick={() => { setSpeakerEnabled(!speakerEnabled); if (speakerEnabled) stopSpeaking(); }}>
            {speakerEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            <span className="text-xs">{speakerEnabled ? 'Audio On' : 'Silent'}</span>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          <kbd className="px-1 py-0.5 bg-muted rounded">Ctrl+Shift+X</kbd> to kill
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Chat area */}
        <ScrollArea className={cn("flex-1 p-4", showLogs && "w-1/2")} ref={scrollRef}>
          {history.length === 0 && !streamingContent && (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="w-10 h-10 mx-auto mb-3 text-primary/50" />
              <p className="text-sm font-medium">OpenClaw</p>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center justify-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", state.isActive ? "bg-green-500" : "bg-yellow-500")} />
                  <span>Agent: {state.isActive ? 'Ready' : 'Initializing...'}</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", whisperReady ? "bg-green-500" : "bg-muted")} />
                  <span>Voice: {whisperReady ? 'Ready' : 'No model'}</span>
                </div>
              </div>
              <p className="text-xs mt-4">Hold <Badge variant="outline" className="mx-1 text-xs">Space</Badge> to talk</p>
              <p className="text-xs mt-2 text-muted-foreground/70">Model: {state.config.model}</p>
              <p className="text-xs mt-3 text-muted-foreground/50">Use ⚒️ Quick Actions to send code to App Builder</p>
              {!state.isActive && <p className="text-xs mt-3 text-yellow-500">No backend connected — check Settings</p>}
            </div>
          )}

          <div className="space-y-4">
            {history.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                  msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-secondary text-secondary-foreground rounded-bl-sm'
                )}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl rounded-bl-sm px-3 py-2 bg-secondary text-sm">
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {state.isProcessing && !streamingContent && (
              <div className="flex justify-start">
                <div className="bg-secondary rounded-xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Logs panel */}
        {showLogs && (
          <div className="w-1/2 border-l border-sidebar-border">
            <div className="p-2 bg-sidebar-accent border-b border-sidebar-border">
              <span className="text-xs font-medium">Action Logs</span>
            </div>
            <ScrollArea className="h-full p-2">
              <div className="space-y-1">
                {logs.slice(0, 30).map((log) => (
                  <div key={log.id} className={cn("text-xs p-1.5 rounded", log.success ? 'bg-secondary/50' : 'bg-destructive/20')}>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1">{log.type}</Badge>
                      <span className="truncate">{log.action}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <div className="flex items-center justify-center gap-2 text-red-500">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-medium">Recording... Release Space to stop</span>
          </div>
        </div>
      )}
      {isTranscribing && (
        <div className="px-4 py-2 bg-primary/10 border-t border-primary/20">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-xs font-medium">Transcribing...</span>
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-4 py-2 border-t border-sidebar-border bg-sidebar-accent/50">
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => selectSuggestion(s)} className="px-2 py-1 text-xs bg-secondary rounded hover:bg-secondary/80">
                {s.length > 30 ? s.slice(0, 30) + '...' : s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Murmur */}
      {murmur && <div className="px-4 py-1 text-center text-xs text-muted-foreground bg-secondary/30">{murmur}</div>}

      {/* Input */}
      <div className="p-3 border-t border-sidebar-border bg-sidebar">
        <div className="relative">
          <Textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Ask OpenClaw anything..." className="min-h-[60px] max-h-[100px] pr-20 resize-none text-sm no-drag" disabled={state.isProcessing} />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <Button variant="ghost" size="icon"
              className={cn("h-7 w-7 rounded-full", isRecording && "bg-red-500/20 text-red-500 animate-pulse")}
              onClick={isRecording ? stopRecording : startRecording} disabled={!micEnabled || isTranscribing}>
              {isRecording ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            </Button>
            <Button size="icon" className="h-7 w-7 rounded-full" onClick={handleSubmit} disabled={!input.trim() || state.isProcessing}>
              <Send className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
