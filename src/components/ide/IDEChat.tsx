import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Send, Mic, MicOff, Settings, Library, Loader2, Volume2, Lightbulb, FileCode, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage as ChatMessageType } from '@/lib/ollama-client';
import { IDEMode, MODE_INFO } from '@/lib/ide-types';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import { parseCodeBlocks } from '@/lib/code-parser';
import { isWhisperLoaded, getDownloadedModels, transcribeAudio, loadWhisperModel, getSelectedWhisperModel } from '@/lib/local-stt';
import { toast } from 'sonner';

interface Message extends ChatMessageType {
  id: string;
  timestamp: number;
}

interface IDEChatProps {
  messages: Message[];
  onSendMessage: (content: string, isPlan?: boolean) => void;
  isLoading: boolean;
  streamingContent?: string;
  mode: IDEMode;
  onOpenSettings: () => void;
  onToggleCodeLibrary: () => void;
  className?: string;
}

/**
 * Strip code blocks that have file paths (applied files) from text,
 * leaving only the conversational parts. Returns cleaned text + list of file paths.
 */
function stripAppliedCode(content: string): { cleanText: string; appliedFiles: string[] } {
  const blocks = parseCodeBlocks(content);
  const appliedFiles = blocks.map(b => b.filePath);

  // Remove code blocks with file paths from the markdown
  let cleanText = content;
  // Remove ```lang:filepath ... ``` blocks
  cleanText = cleanText.replace(/```\w+(?::|\s+)\/?\S+\.\w+\s*\n[\s\S]*?```/g, '');
  // Remove ```lang\n// filepath: ... blocks
  cleanText = cleanText.replace(/```\w+\s*\n\/\/\s*(?:filepath|file|path):\s*\S+\n[\s\S]*?```/g, '');
  // Clean up excessive newlines
  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

  return { cleanText, appliedFiles };
}

function AppliedFilesCard({ files }: { files: string[] }) {
  if (files.length === 0) return null;
  return (
    <div className="mt-2 p-3 rounded-lg bg-accent/10 border border-accent/20">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="text-xs font-semibold text-foreground">
          Applied {files.length} file{files.length > 1 ? 's' : ''} to project
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {files.map(f => (
          <div key={f} className="flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-xs font-mono text-muted-foreground">
            <FileCode className="h-3 w-3" />
            {f.split('/').pop()}
          </div>
        ))}
      </div>
    </div>
  );
}

export function IDEChat({
  messages, onSendMessage, isLoading, streamingContent, mode,
  onOpenSettings, onToggleCodeLibrary, className,
}: IDEChatProps) {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [whisperReady, setWhisperReady] = useState(false);
  const [isPlanMode, setIsPlanMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const modeInfo = MODE_INFO[mode];

  const showPlanButton = mode === 'app-builder' || mode === 'ai-improvement';

  useEffect(() => {
    const checkWhisper = () => {
      setWhisperReady(isWhisperLoaded() || getDownloadedModels().length > 0);
    };
    checkWhisper();
    const handleModelChange = () => checkWhisper();
    window.addEventListener('whisper-model-changed', handleModelChange);
    return () => window.removeEventListener('whisper-model-changed', handleModelChange);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingContent]);

  const startRecording = useCallback(async () => {
    if (!whisperReady) {
      toast.info('Voice requires a Whisper model. Go to Settings to download one.', {
        action: { label: 'Settings', onClick: onOpenSettings },
      });
      return;
    }
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
    } catch (error) { console.error('Failed to start recording:', error); toast.error('Failed to access microphone'); }
  }, [whisperReady, onOpenSettings]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); }
  }, [isRecording]);

  const transcribeRecording = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      if (!isWhisperLoaded()) {
        toast.loading('Loading Whisper model...', { id: 'whisper-loading' });
        await loadWhisperModel(getSelectedWhisperModel());
        toast.dismiss('whisper-loading');
      }
      const text = await transcribeAudio(audioBlob);
      if (text.trim()) setInput(prev => prev + (prev ? ' ' : '') + text.trim());
    } catch (error) { console.error('Transcription failed:', error); toast.error('Failed to transcribe audio'); }
    finally { setIsTranscribing(false); }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isRecording && document.activeElement !== textareaRef.current && !e.repeat) {
        e.preventDefault(); startRecording();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isRecording) { e.preventDefault(); stopRecording(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [isRecording, startRecording, stopRecording]);

  const handleSubmit = useCallback(() => {
    if (input.trim() && !isLoading) { onSendMessage(input.trim(), isPlanMode); setInput(''); }
  }, [input, isLoading, onSendMessage, isPlanMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const toggleRecording = () => { isRecording ? stopRecording() : startRecording(); };

  const renderAssistantMessage = (content: string) => {
    const { cleanText, appliedFiles } = stripAppliedCode(content);
    return (
      <>
        {cleanText && (
          <div className="prose prose-sm prose-invert max-w-none text-sm">
            <ReactMarkdown
              components={{
                // Render remaining (non-file-path) code blocks as inline snippets
                code: ({ className, children, ...props }) => {
                  const codeStr = String(children).replace(/\n$/, '');
                  const match = /language-(\w+)/.exec(className || '');
                  const isBlock = match || codeStr.includes('\n') || codeStr.length > 80;
                  if (isBlock) {
                    return (
                      <pre className="bg-muted/50 rounded-md p-2 overflow-x-auto my-2 text-xs">
                        <code className={className} {...props}>{children}</code>
                      </pre>
                    );
                  }
                  return <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>;
                },
                pre: ({ children }) => <>{children}</>,
              }}
            >{cleanText}</ReactMarkdown>
          </div>
        )}
        <AppliedFilesCard files={appliedFiles} />
      </>
    );
  };

  return (
    <div className={cn('flex flex-col h-full bg-sidebar', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">{modeInfo.icon}</span>
          <div>
            <h2 className="text-sm font-semibold text-sidebar-foreground">{modeInfo.name}</h2>
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{modeInfo.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleCodeLibrary}><Library className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenSettings}><Settings className="h-4 w-4" /></Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="text-4xl mb-4">{modeInfo.icon}</div>
              <p className="text-sm">Start a conversation to build something amazing!</p>
              <p className="text-xs mt-2 opacity-75">Hold <Badge variant="outline" className="mx-1">Space</Badge> to talk</p>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-2xl px-4 py-3',
                message.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary text-secondary-foreground rounded-bl-md'
              )}>
                {message.role === 'assistant' ? (
                  renderAssistantMessage(message.content)
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
            </div>
          ))}
          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-secondary text-secondary-foreground rounded-bl-md">
                <div className="prose prose-sm prose-invert max-w-none text-sm">
                  <ReactMarkdown>{streamingContent}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
          {isLoading && !streamingContent && (
            <div className="flex justify-start">
              <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Thinking...</span></div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {isRecording && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <div className="flex items-center justify-center gap-2 text-red-500">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium">Recording... Release Space to stop</span>
          </div>
        </div>
      )}
      {isTranscribing && (
        <div className="px-4 py-2 bg-primary/10 border-t border-primary/20">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm font-medium">Transcribing...</span>
          </div>
        </div>
      )}

      <div className="p-4 border-t border-sidebar-border">
        <div className="relative">
          <Textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={isPlanMode ? "Describe what to plan..." : "Describe what you want to build..."}
            className="min-h-[80px] pr-24 resize-none bg-sidebar-accent border-sidebar-border" disabled={isLoading} />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {showPlanButton && (
              <Button variant="ghost" size="icon"
                className={cn("h-8 w-8 rounded-full", isPlanMode ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-amber-400")}
                onClick={() => setIsPlanMode(!isPlanMode)} title={isPlanMode ? "Planning ON" : "Toggle planning"}>
                <Lightbulb className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon"
              className={cn('h-8 w-8 rounded-full transition-colors',
                isRecording && 'bg-red-500/20 text-red-500 animate-pulse',
                !isRecording && whisperReady && 'text-green-500 hover:bg-green-500/20'
              )}
              onClick={toggleRecording} disabled={isTranscribing}>
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button size="icon" className="h-8 w-8 rounded-full" onClick={handleSubmit} disabled={!input.trim() || isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to send •{' '}
          Hold <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Space</kbd> to talk
          {showPlanButton && <> • <kbd className="px-1 py-0.5 bg-muted rounded text-xs">💡</kbd> Plan mode</>}
        </p>
      </div>
    </div>
  );
}