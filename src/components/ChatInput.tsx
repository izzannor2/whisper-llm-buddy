import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Send, Mic, MicOff, Square, Loader2, ChevronDown, X, Code, Sparkles, FileText, ListTodo, Search, Shield, Pencil, Minus, Settings, Paperclip, Volume2, Lightbulb, Globe, Phone, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isWhisperLoaded, loadWhisperModel, transcribeAudio, getSelectedWhisperModel, getDownloadedModels, isVoiceReady, isSelectedModelCached, getAnyCachedModel } from '@/lib/local-stt';
import { loadSettings, saveSettings, CLOUD_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS, GOOGLE_MODELS, ChatSettings } from '@/lib/chat-api';
import { getModeTheme } from '@/lib/mode-themes';

import { MessageAttachment } from '@/lib/db';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export interface Attachment {
  name: string;
  type: string;
  dataUrl?: string;
  textContent?: string;
}

interface ChatInputProps {
  onSend: (message: string, isPlan?: boolean, attachments?: Attachment[]) => void;
  isLoading: boolean;
  onStop?: () => void;
  autoSendOnVoice?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  modelLoaded?: boolean;
  modeKey?: string;
  planningMode?: boolean;
  onPlanningToggle?: (active: boolean) => void;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
  isOfflineMode?: boolean;
  onVoiceCall?: () => void;
  availableOllamaModels?: string[];
  llamaCppAvailable?: boolean;
  onSettingsChange?: (settings: ChatSettings) => void;
}

export interface ChatInputRef {
  startListening: () => void;
  stopListening: () => void;
  isListening: boolean;
  setMessage: (text: string) => void;
  appendMessage: (text: string) => void;
}

const PRESETS = [
  { id: 'coder', name: 'Coder', icon: Code, color: 'text-purple-400' },
  { id: 'creative', name: 'Creative', icon: Sparkles, color: 'text-pink-400' },
  { id: 'docket', name: 'LocalDev', icon: FileText, color: 'text-blue-400' },
  { id: 'minimal', name: 'Minimal', icon: Minus, color: 'text-muted-foreground' },
  { id: 'planner', name: 'Planner', icon: ListTodo, color: 'text-amber-400' },
  { id: 'research', name: 'Research', icon: Search, color: 'text-cyan-400' },
  { id: 'survival', name: 'Survival', icon: Shield, color: 'text-orange-400' },
  { id: 'writer', name: 'Writer', icon: Pencil, color: 'text-green-400' },
];

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((event: any) => void) | null; onerror: ((event: any) => void) | null;
  onend: (() => void) | null; onstart: (() => void) | null;
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  function ChatInput({ onSend, isLoading, onStop, autoSendOnVoice, selectedModel = 'llama-3.2-1b',
    onModelChange, modelLoaded = false, modeKey = 'chat', planningMode = false, onPlanningToggle,
    webSearchEnabled = false, onWebSearchToggle, onVoiceCall,
    availableOllamaModels = [], llamaCppAvailable = false, onSettingsChange,
  }, ref) {
    const [settings, setSettingsState] = useState<ChatSettings>(() => loadSettings());
    const [message, setMessage] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [currentPreset, setCurrentPreset] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    const [whisperAvailable, setWhisperAvailable] = useState(() => isVoiceReady());

    const getBackendDisplayName = () => {
      switch (settings.backend) {
        case 'cloud': return 'Cloud';
        case 'ollama': return settings.ollamaModel || 'Ollama';
        case 'local': return 'Llama.cpp (local)';
        case 'openai': return settings.model || 'OpenAI';
        case 'anthropic': return settings.model || 'Anthropic';
        case 'google': return settings.model || 'Google';
        case 'huggingface': return settings.huggingfaceModel?.split('/').pop() || 'HuggingFace';
        default: return settings.backend;
      }
    };

    useEffect(() => {
      const checkWhisper = () => setWhisperAvailable(isVoiceReady());
      checkWhisper();
      window.addEventListener('whisper-model-changed', checkWhisper);
      return () => window.removeEventListener('whisper-model-changed', checkWhisper);
    }, []);

    useImperativeHandle(ref, () => ({
      startListening: () => { if (!isRecording && !isTranscribing) toggleRecording(); },
      stopListening: () => { if (isRecording) stopRecording(); },
      isListening: isRecording,
      setMessage: (text: string) => setMessage(text),
      appendMessage: (text: string) => setMessage(prev => prev + (prev ? '\n\n' : '') + text),
    }), [isRecording, isTranscribing]);

    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
      }
    }, [message]);

    const handlePresetSelect = (presetId: string) => {
      setCurrentPreset(presetId);
      toast.success(`Preset: ${PRESETS.find(p => p.id === presetId)?.name}`);
    };

    const startLocalRecording = useCallback(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunksRef.current = [];
        mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          if (audioChunksRef.current.length === 0) return;
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setIsTranscribing(true);
          try {
            if (!isWhisperLoaded()) {
              toast.error('Loading Whisper model...');
              const success = await loadWhisperModel(getSelectedWhisperModel(), (progress) => { if (progress.message) toast.loading(progress.message, { id: 'whisper-loading' }); });
              toast.dismiss('whisper-loading');
              if (!success) throw new Error('Failed to load model');
              setWhisperAvailable(true);
            }
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioContext = new AudioContext({ sampleRate: 16000 });
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const audioData = audioBuffer.getChannelData(0);
            const text = await transcribeAudio(audioData);
            if (text.trim()) { setMessage(prev => prev ? prev + ' ' + text.trim() : text.trim()); }
          } catch (error) { console.error('Transcription error:', error); toast.error('Failed to transcribe audio'); }
          finally { setIsTranscribing(false); }
        };
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
        toast.success('Recording... (local Whisper)', { duration: 1500 });
      } catch (error) { console.error('Failed to start recording:', error); toast.error('Failed to access microphone'); }
    }, [autoSendOnVoice, onSend]);

    const stopRecording = useCallback(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
    }, []);

    const handleSend = () => {
      if ((message.trim() || attachments.length > 0) && !isLoading) {
        onSend(message.trim(), planningMode, attachments.length > 0 ? attachments : undefined);
        setMessage('');
        setAttachments([]);
      }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      e.target.value = '';

      const MAX_SIZE = 5 * 1024 * 1024; // 5MB
      const newAttachments: Attachment[] = [];

      for (const file of files) {
        if (file.size > MAX_SIZE) {
          toast.error(`${file.name} is too large (max 5MB)`);
          continue;
        }

        const isImage = file.type.startsWith('image/');
        const isText = /\.(txt|md|json|js|jsx|ts|tsx|py|css|html|xml|yaml|yml|csv|log|env|toml|sh|bat|rs|go|java|c|cpp|h|hpp|rb|php|sql|r|swift|kt)$/i.test(file.name);

        if (isImage) {
          const dataUrl = await readFileAsDataUrl(file);
          newAttachments.push({ name: file.name, type: file.type, dataUrl });
        } else if (isText) {
          const textContent = await readFileAsText(file);
          newAttachments.push({ name: file.name, type: file.type, textContent });
        } else {
          // Binary/archive — just store filename
          newAttachments.push({ name: file.name, type: file.type });
        }
      }
      setAttachments(prev => [...prev, ...newAttachments]);
    };

    const removeAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));
    const showPlanButton = modeKey === 'app-builder' || modeKey === 'ai-improvement' || modeKey === 'all-in-one';

    const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

    const toggleRecording = useCallback(() => {
      if (isRecording) { stopRecording(); return; }
      if (!whisperAvailable) {
        toast.info('Download a voice model first', {
          description: 'Go to Settings → Voice Models to download Whisper.',
          action: { label: 'Open Settings', onClick: () => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'voicemodels' } })) },
          duration: 5000,
        });
        return;
      }
      startLocalRecording();
    }, [isRecording, whisperAvailable, startLocalRecording, stopRecording]);

    const switchBackendModel = (backend: ChatSettings['backend'], model: string) => {
      const updated = { ...loadSettings(), backend };
      if (backend === 'ollama') updated.ollamaModel = model;
      else if (backend === 'huggingface') updated.huggingfaceModel = model;
      else updated.model = model;
      saveSettings(updated);
      setSettingsState(updated);
      onSettingsChange?.(updated);
      toast.success(`Switched to ${model}`);
    };

    const currentModelName = getBackendDisplayName();
    const currentPresetData = currentPreset ? PRESETS.find(p => p.id === currentPreset) : null;
    const PresetIcon = currentPresetData?.icon;
    const openSettings = () => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'backend' } }));

    return (
      <div className="p-4 border-t border-border bg-background">
        <div className="max-w-4xl mx-auto">
          {/* Mode indicator */}
          {modeKey !== 'chat' && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{
                background: `hsl(${getModeTheme(modeKey).accent} / 0.15)`,
                color: `hsl(${getModeTheme(modeKey).accent})`,
              }}>
                {MODE_DISPLAY_NAMES[modeKey] || modeKey}
              </span>
              {modeKey === 'jailbreak' && <span className="text-xs text-muted-foreground">⚠ Custom prompt active</span>}
              {modeKey === 'system-helper' && <span className="text-xs text-muted-foreground">Commands require approval</span>}
              {modeKey === 'all-in-one' && <span className="text-xs text-muted-foreground">🔥 All capabilities active</span>}
            </div>
          )}
          {/* Input Container */}
          <div className="bg-card/50 border border-border rounded-xl p-3">
            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" multiple className="hidden"
              accept="image/*,.txt,.md,.json,.js,.jsx,.ts,.tsx,.py,.css,.html,.xml,.yaml,.yml,.csv,.log,.zip,.rar,.7z,.tar,.gz,.pdf,.doc,.docx"
              onChange={handleFileSelect} />

            {/* Attachment preview strip */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 p-2 bg-muted/30 rounded-lg">
                {attachments.map((att, idx) => (
                  <div key={idx} className="relative group">
                    {att.dataUrl && att.type.startsWith('image/') ? (
                      <div className="relative w-16 h-16 rounded-md overflow-hidden border border-border">
                        <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                        <button onClick={() => removeAttachment(idx)}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted border border-border text-xs">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="max-w-[120px] truncate">{att.name}</span>
                        <button onClick={() => removeAttachment(idx)} className="ml-1 text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? "Listening..." : attachments.length > 0 ? "Add a message about your files..." : "Ask anything"}
              className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent p-2 focus-visible:ring-0 scrollbar-thin text-sm"
              disabled={isLoading}
              rows={1}
            />
            
            <div className="flex items-center gap-2 mt-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-3 text-accent hover:text-accent/80 hover:bg-accent/10 font-mono text-sm">
                    {currentModelName}
                    <span className="w-2 h-2 rounded-full bg-accent ml-2" />
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-popover border-border z-50 w-56 max-h-80 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">CLOUD</DropdownMenuLabel>
                  {CLOUD_MODELS.map(m => (
                    <DropdownMenuItem key={m.id} onClick={() => switchBackendModel('cloud', m.id)}
                      className={cn("font-mono text-sm", settings.backend === 'cloud' && settings.model === m.id && "bg-accent/10")}>
                      {m.name}
                    </DropdownMenuItem>
                  ))}
                  {availableOllamaModels.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">OLLAMA</DropdownMenuLabel>
                      {availableOllamaModels.map(m => (
                        <DropdownMenuItem key={m} onClick={() => switchBackendModel('ollama', m)}
                          className={cn("font-mono text-sm", settings.backend === 'ollama' && settings.ollamaModel === m && "bg-accent/10")}>
                          {m}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {llamaCppAvailable && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">LLAMA.CPP</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => switchBackendModel('local', 'local')}
                        className={cn("font-mono text-sm", settings.backend === 'local' && "bg-accent/10")}>
                        Local Model (port 8081)
                      </DropdownMenuItem>
                    </>
                  )}
                  {settings.apiKeys?.openai && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">OPENAI</DropdownMenuLabel>
                      {OPENAI_MODELS.map(m => (
                        <DropdownMenuItem key={m.id} onClick={() => switchBackendModel('openai', m.id)}
                          className={cn("font-mono text-sm", settings.backend === 'openai' && settings.model === m.id && "bg-accent/10")}>
                          {m.name}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {settings.apiKeys?.anthropic && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">ANTHROPIC</DropdownMenuLabel>
                      {ANTHROPIC_MODELS.map(m => (
                        <DropdownMenuItem key={m.id} onClick={() => switchBackendModel('anthropic', m.id)}
                          className={cn("font-mono text-sm", settings.backend === 'anthropic' && settings.model === m.id && "bg-accent/10")}>
                          {m.name}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {settings.apiKeys?.google && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">GOOGLE</DropdownMenuLabel>
                      {GOOGLE_MODELS.map(m => (
                        <DropdownMenuItem key={m.id} onClick={() => switchBackendModel('google', m.id)}
                          className={cn("font-mono text-sm", settings.backend === 'google' && settings.model === m.id && "bg-accent/10")}>
                          {m.name}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={openSettings} className="font-mono text-sm text-muted-foreground">
                    <Settings className="w-3.5 h-3.5 mr-2" />More options…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-3 bg-muted/50 hover:bg-muted font-mono text-sm">
                    {PresetIcon ? <PresetIcon className={cn("w-3.5 h-3.5 mr-1.5", currentPresetData?.color)} /> : <X className="w-3 h-3 mr-1.5 text-muted-foreground" />}
                    {currentPresetData?.name || 'Select Preset'}
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-popover border-border z-50 w-48">
                  <DropdownMenuItem onClick={() => setCurrentPreset(null)} className="font-mono text-sm">
                    <X className="w-3.5 h-3.5 mr-2 text-muted-foreground" />Select Preset
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">BUILT-IN</DropdownMenuLabel>
                  {PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    return (
                      <DropdownMenuItem key={preset.id} onClick={() => handlePresetSelect(preset.id)}
                        className={cn("font-mono text-sm", currentPreset === preset.id && "bg-accent/10")}>
                        <Icon className={cn("w-3.5 h-3.5 mr-2", preset.color)} />{preset.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()} title="Attach files">
                <Paperclip className="w-4 h-4" />
              </Button>

              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-accent hover:text-accent/80">
                <Volume2 className="w-4 h-4" />
              </Button>

              <Button
                variant={webSearchEnabled ? "default" : "ghost"}
                size="sm"
                className={cn("h-8 gap-1.5 text-xs font-medium",
                  webSearchEnabled ? "bg-cyan-500/90 hover:bg-cyan-500 text-white" : "text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10",
                  isOfflineMode && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => !isOfflineMode && onWebSearchToggle?.(!webSearchEnabled)}
                disabled={isOfflineMode}
                title={isOfflineMode ? "Go online to use web search" : webSearchEnabled ? "Web search ON — queries will search the web first" : "Toggle web search"}
              >
                <Globe className="w-3.5 h-3.5" />
                {webSearchEnabled ? 'Search On' : 'Search'}
              </Button>

              {showPlanButton && (
                <Button
                  variant={planningMode ? "default" : "ghost"}
                  size="sm"
                  className={cn("h-8 gap-1.5 text-xs font-medium",
                    planningMode ? "bg-amber-500/90 hover:bg-amber-500 text-white" : "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                  )}
                  onClick={() => onPlanningToggle?.(!planningMode)}
                  title={planningMode ? "Planning mode ON — messages plan before building" : "Toggle planning mode"}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {planningMode ? 'Planning' : 'Plan'}
                </Button>
              )}

              <div className="flex-1" />

              {onVoiceCall && (
                <Button
                  variant="ghost" size="icon"
                  className={cn('h-8 w-8 rounded-full transition-all',
                    whisperAvailable ? 'text-green-500 hover:text-green-400 hover:bg-green-500/10' : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={onVoiceCall}
                  title="Start voice call"
                >
                  <Phone className="w-4 h-4" />
                </Button>
              )}

              <Button
                variant="ghost" size="icon"
                className={cn('h-8 w-8 rounded-full transition-all',
                  isRecording && 'bg-destructive text-destructive-foreground animate-pulse-glow',
                  isTranscribing && 'bg-primary/20',
                  !isRecording && !isTranscribing && whisperAvailable && 'text-accent hover:text-accent/80 hover:bg-accent/10',
                  !isRecording && !isTranscribing && !whisperAvailable && 'text-muted-foreground hover:text-foreground'
                )}
                onClick={toggleRecording}
                disabled={isLoading || isTranscribing}
              >
                {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>

              {isLoading ? (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onStop}>
                  <Square className="w-4 h-4" />
                </Button>
              ) : (
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-muted" onClick={handleSend} disabled={!message.trim() && attachments.length === 0}>
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground font-mono">
            <span>Hold</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] border border-border">Space</kbd>
            <span>to talk</span>
            <span className="mx-1">•</span>
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] border border-border">Enter</kbd>
            <span>to send</span>
            <span className="mx-1">•</span>
            <button className="flex items-center gap-1 hover:text-accent transition-colors"
              onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'voicemodels' } }))}>
              <Settings className="w-3 h-3" />Get offline voice
            </button>
          </div>
        </div>
      </div>
    );
  }
);

const MODE_DISPLAY_NAMES: Record<string, string> = {
  chat: 'Chat',
  'app-builder': 'App Builder',
  'embedded-iot': 'IoT / Embedded',
  'system-helper': 'System Helper',
  'ai-improvement': 'AI Improvement',
  learning: 'Learning',
  sandbox: 'Sandbox',
  jailbreak: 'Uncensored',
  plugin: 'Plugin',
  'all-in-one': 'All-in-One AI',
};
