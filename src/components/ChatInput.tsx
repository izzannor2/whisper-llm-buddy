import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Send, Mic, MicOff, Square, Loader2, ChevronDown, X, Code, Sparkles, FileText, ListTodo, Search, Shield, Pencil, Minus, Settings, Paperclip, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  isWhisperLoaded, 
  loadWhisperModel, 
  transcribeAudio, 
  getSelectedWhisperModel,
  getDownloadedModels
} from '@/lib/local-stt';
import { loadSettings, CLOUD_MODELS } from '@/lib/chat-api';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  onStop?: () => void;
  autoSendOnVoice?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  modelLoaded?: boolean;
}

export interface ChatInputRef {
  startListening: () => void;
  stopListening: () => void;
  isListening: boolean;
}

// Presets with icons matching Docket
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
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  function ChatInput({ 
    onSend, 
    isLoading, 
    onStop, 
    autoSendOnVoice,
    selectedModel = 'llama-3.2-1b',
    onModelChange,
    modelLoaded = false
  }, ref) {
    const settings = loadSettings();
    const [message, setMessage] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [currentPreset, setCurrentPreset] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const [whisperAvailable, setWhisperAvailable] = useState(() => {
      return isWhisperLoaded() || getDownloadedModels().length > 0;
    });
    
    // Get current backend and model info
    const getBackendDisplayName = () => {
      switch (settings.backend) {
        case 'cloud': return 'Cloud';
        case 'ollama': return settings.ollamaModel || 'Ollama';
        case 'local': return 'Llama.cpp';
        case 'openai': return settings.model || 'OpenAI';
        case 'anthropic': return settings.model || 'Anthropic';
        case 'google': return settings.model || 'Google';
        case 'huggingface': return settings.huggingfaceModel?.split('/').pop() || 'HuggingFace';
        default: return settings.backend;
      }
    };

    useEffect(() => {
      const checkWhisper = () => {
        setWhisperAvailable(isWhisperLoaded() || getDownloadedModels().length > 0);
      };
      checkWhisper();
      window.addEventListener('whisper-model-changed', checkWhisper);
      return () => window.removeEventListener('whisper-model-changed', checkWhisper);
    }, []);

    useImperativeHandle(ref, () => ({
      startListening: () => {
        if (!isRecording && !isTranscribing) {
          toggleRecording();
        }
      },
      stopListening: () => {
        if (isRecording) {
          stopRecording();
        }
      },
      isListening: isRecording,
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

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          
          if (audioChunksRef.current.length === 0) return;

          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setIsTranscribing(true);
          
          try {
            if (!isWhisperLoaded()) {
              toast.error('Loading Whisper model...');
              const success = await loadWhisperModel(getSelectedWhisperModel(), (progress) => {
                if (progress.message) {
                  toast.loading(progress.message, { id: 'whisper-loading' });
                }
              });
              toast.dismiss('whisper-loading');
              if (!success) throw new Error('Failed to load model');
              setWhisperAvailable(true);
            }

            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioContext = new AudioContext({ sampleRate: 16000 });
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const audioData = audioBuffer.getChannelData(0);

            const text = await transcribeAudio(audioData);
            
            if (text.trim()) {
              if (autoSendOnVoice) {
                onSend(text.trim());
              } else {
                setMessage(text.trim());
              }
            }
          } catch (error) {
            console.error('Transcription error:', error);
            toast.error('Failed to transcribe audio');
          } finally {
            setIsTranscribing(false);
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
        toast.success('Recording... (local Whisper)', { duration: 1500 });
      } catch (error) {
        console.error('Failed to start recording:', error);
        toast.error('Failed to access microphone');
      }
    }, [autoSendOnVoice, onSend]);

    const stopRecording = useCallback(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
    }, []);

    const handleSend = () => {
      if (message.trim() && !isLoading) {
        onSend(message.trim());
        setMessage('');
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    const toggleRecording = useCallback(() => {
      if (isRecording) {
        stopRecording();
        return;
      }

      if (!whisperAvailable) {
        toast.info('Download a voice model first', {
          description: 'Go to Settings → Voice Models to download Whisper.',
          action: {
            label: 'Open Settings',
            onClick: () => {
              window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'voicemodels' } }));
            }
          },
          duration: 5000,
        });
        return;
      }

      startLocalRecording();
    }, [isRecording, whisperAvailable, startLocalRecording, stopRecording]);

    const currentModelName = getBackendDisplayName();
    const currentPresetData = currentPreset ? PRESETS.find(p => p.id === currentPreset) : null;
    const PresetIcon = currentPresetData?.icon;

    const openSettings = () => {
      window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'backend' } }));
    };

    return (
      <div className="p-4 border-t border-border bg-background">
        <div className="max-w-4xl mx-auto">
          {/* Input Container */}
          <div className="bg-card/50 border border-border rounded-xl p-3">
            {/* Text Input */}
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? "Listening..." : "Ask anything"}
              className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent p-2 focus-visible:ring-0 scrollbar-thin text-sm"
              disabled={isLoading}
              rows={1}
            />
            
            {/* Bottom Row: Model + Preset + Actions */}
            <div className="flex items-center gap-2 mt-2">
              {/* Backend/Model Display - Click to open settings */}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-3 text-accent hover:text-accent/80 hover:bg-accent/10 font-mono text-sm"
                onClick={openSettings}
                title="Click to change backend/model in settings"
              >
                {currentModelName}
                <span className="w-2 h-2 rounded-full bg-accent ml-2" />
                <Settings className="w-3 h-3 ml-1" />
              </Button>

              {/* Preset Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-3 bg-muted/50 hover:bg-muted font-mono text-sm"
                  >
                    {PresetIcon ? (
                      <PresetIcon className={cn("w-3.5 h-3.5 mr-1.5", currentPresetData?.color)} />
                    ) : (
                      <X className="w-3 h-3 mr-1.5 text-muted-foreground" />
                    )}
                    {currentPresetData?.name || 'Select Preset'}
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-popover border-border z-50 w-48">
                  <DropdownMenuItem
                    onClick={() => setCurrentPreset(null)}
                    className="font-mono text-sm"
                  >
                    <X className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    Select Preset
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">
                    BUILT-IN
                  </DropdownMenuLabel>
                  {PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    return (
                      <DropdownMenuItem
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset.id)}
                        className={cn(
                          "font-mono text-sm",
                          currentPreset === preset.id && "bg-accent/10"
                        )}
                      >
                        <Icon className={cn("w-3.5 h-3.5 mr-2", preset.color)} />
                        {preset.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Attachment button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="w-4 h-4" />
              </Button>

              {/* TTS toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-accent hover:text-accent/80"
              >
                <Volume2 className="w-4 h-4" />
              </Button>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Voice button */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-full transition-all',
                  isRecording && 'bg-destructive text-destructive-foreground animate-pulse-glow',
                  isTranscribing && 'bg-primary/20',
                  !isRecording && !isTranscribing && whisperAvailable && 'text-accent hover:text-accent/80 hover:bg-accent/10',
                  !isRecording && !isTranscribing && !whisperAvailable && 'text-muted-foreground hover:text-foreground'
                )}
                onClick={toggleRecording}
                disabled={isLoading || isTranscribing}
              >
                {isTranscribing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </Button>

              {/* Send/Stop button */}
              {isLoading ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={onStop}
                >
                  <Square className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-muted"
                  onClick={handleSend}
                  disabled={!message.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          
          {/* Keyboard Hints */}
          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground font-mono">
            <span>Hold</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] border border-border">Space</kbd>
            <span>to talk</span>
            <span className="mx-1">•</span>
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] border border-border">Enter</kbd>
            <span>to send</span>
            <span className="mx-1">•</span>
            <button 
              className="flex items-center gap-1 hover:text-accent transition-colors"
              onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'voicemodels' } }))}
            >
              <Settings className="w-3 h-3" />
              Get offline voice
            </button>
          </div>
        </div>
      </div>
    );
  }
);
