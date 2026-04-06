import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone, PhoneOff, Mic, Volume2, Loader2, MicOff, Hand,
  Monitor, MonitorOff, MessageSquare, Send, ChevronDown, VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  isWhisperLoaded, loadWhisperModel, transcribeAudio,
  getSelectedWhisperModel, getDownloadedModels, isVoiceReady,
  isSelectedModelCached, getAnyCachedModel,
} from '@/lib/local-stt';
import { speak, stopSpeaking, isTTSSupported } from '@/lib/tts';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isVoice?: boolean;
  screenshot?: string; // base64
}

interface VoiceCallModeProps {
  onSendMessage: (message: string, screenshot?: string) => Promise<string>;
  ttsVoice?: string;
  ttsRate?: number;
  disabled?: boolean;
  onEnd?: () => void;
  autoStart?: boolean;
  /** Existing conversation messages to display in the chat panel */
  existingMessages?: VoiceMessage[];
  /** Callback when a new voice message pair is created so parent can persist */
  onNewMessages?: (userMsg: VoiceMessage, assistantMsg: VoiceMessage) => void;
}

type CallState = 'idle' | 'loading' | 'listening' | 'processing' | 'speaking' | 'waiting';

const MODEL_OPTIONS = [
  { value: 'gemini-flash', label: 'Gemini Flash' },
  { value: 'gemini-pro', label: 'Gemini Pro (Vision)' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function VoiceCallMode({
  onSendMessage,
  ttsVoice,
  ttsRate = 1.0,
  disabled,
  onEnd,
  autoStart = false,
  existingMessages = [],
  onNewMessages,
}: VoiceCallModeProps) {
  const [isInCall, setIsInCall] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [transcript, setTranscript] = useState('');
  const [loadingMessage, setLoadingMessage] = useState('');
  const [pushToTalk, setPushToTalk] = useState(() => localStorage.getItem('voice-push-to-talk') === 'true');
  const [isHoldingSpace, setIsHoldingSpace] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-flash');
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callElapsed, setCallElapsed] = useState('00:00');

  // Screen share state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenPreview, setScreenPreview] = useState<string | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCaptureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const latestScreenshotRef = useRef<string | null>(null);

  // Chat history for the call
  const [callMessages, setCallMessages] = useState<VoiceMessage[]>(existingMessages);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Audio refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isCallActiveRef = useRef(false);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pushToTalkRef = useRef(pushToTalk);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  // Sync existing messages when they change
  useEffect(() => {
    if (existingMessages.length > 0) {
      setCallMessages(existingMessages);
    }
  }, [existingMessages]);

  useEffect(() => {
    pushToTalkRef.current = pushToTalk;
    localStorage.setItem('voice-push-to-talk', String(pushToTalk));
  }, [pushToTalk]);

  const whisperReady = isVoiceReady();
  const ttsReady = isTTSSupported();
  const canMakeCall = whisperReady; // TTS is optional (speaker-off mode works without it)

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [callMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { endCall(); };
  }, []);

  // Call timer
  useEffect(() => {
    if (!isInCall || !callStartTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      setCallElapsed(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isInCall, callStartTime]);

  // Auto-start
  useEffect(() => {
    if (autoStart && !isInCall && canMakeCall) {
      startCall();
    }
  }, [autoStart]);

  /* ---------------------------------------------------------------- */
  /*  Audio Waveform Visualization                                     */
  /* ---------------------------------------------------------------- */
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser || !isCallActiveRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const barWidth = (width / bufferLength) * 2.5;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * height * 0.8;
      const hue = callState === 'listening' ? 142 : callState === 'speaking' ? 262 : 220;
      ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.6 + (dataArray[i] / 255) * 0.4})`;
      ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
      x += barWidth;
    }
    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, [callState]);

  useEffect(() => {
    if (isInCall && analyserRef.current && (callState === 'listening' || callState === 'speaking')) {
      drawWaveform();
    }
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [isInCall, callState, drawWaveform]);

  /* ---------------------------------------------------------------- */
  /*  Screen Sharing                                                   */
  /* ---------------------------------------------------------------- */
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      // Create a hidden video element to capture frames
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.play();
      screenVideoRef.current = video;

      // Capture a frame every 8 seconds
      const captureFrame = () => {
        if (!video.videoWidth) return;
        const c = document.createElement('canvas');
        c.width = Math.min(video.videoWidth, 1280);
        c.height = Math.min(video.videoHeight, 720);
        const cx = c.getContext('2d');
        if (cx) {
          cx.drawImage(video, 0, 0, c.width, c.height);
          const dataUrl = c.toDataURL('image/jpeg', 0.6);
          latestScreenshotRef.current = dataUrl;
          setScreenPreview(dataUrl);
        }
      };

      // Initial capture after a small delay
      setTimeout(captureFrame, 1000);
      screenCaptureIntervalRef.current = setInterval(captureFrame, 8000);

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopScreenShare();
      });

      toast.success('Screen sharing started');
    } catch (err: any) {
      if (err.name !== 'AbortError') toast.error('Failed to start screen sharing');
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenCaptureIntervalRef.current) {
      clearInterval(screenCaptureIntervalRef.current);
      screenCaptureIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.pause();
      screenVideoRef.current = null;
    }
    latestScreenshotRef.current = null;
    setScreenPreview(null);
    setIsScreenSharing(false);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Silence Detection                                                */
  /* ---------------------------------------------------------------- */
  const detectSilence = useCallback((stream: MediaStream, onSilence: () => void) => {
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 512;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let silenceStart = 0;
    const SILENCE_THRESHOLD = 15;
    const SILENCE_DURATION = 1500;

    const checkAudio = () => {
      if (!isCallActiveRef.current) return;
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
      if (average < SILENCE_THRESHOLD) {
        if (!silenceStart) silenceStart = Date.now();
        if (Date.now() - silenceStart > SILENCE_DURATION) { onSilence(); return; }
      } else { silenceStart = 0; }
      requestAnimationFrame(checkAudio);
    };
    checkAudio();
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Core: Start Listening                                            */
  /* ---------------------------------------------------------------- */
  const startListening = useCallback(async () => {
    if (!isCallActiveRef.current || isMuted) return;
    setCallState('listening');
    setTranscript('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

      mediaRecorder.onstop = async () => {
        if (!isCallActiveRef.current) return;
        if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
        stream.getTracks().forEach(t => t.stop());

        if (audioChunksRef.current.length === 0) {
          if (isCallActiveRef.current && !pushToTalkRef.current) setTimeout(() => startListening(), 500);
          else if (isCallActiveRef.current && pushToTalkRef.current) setCallState('waiting');
          return;
        }

        setCallState('processing');
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        try {
          if (!isWhisperLoaded()) {
            setLoadingMessage('Loading speech model...');
            setCallState('loading');
            const success = await loadWhisperModel(getSelectedWhisperModel(), (p) => { if (p.message) setLoadingMessage(p.message); });
            if (!success) throw new Error('Failed to load Whisper model');
            setCallState('processing');
          }

          const arrayBuffer = await audioBlob.arrayBuffer();
          const ac = new AudioContext({ sampleRate: 16000 });
          const ab = await ac.decodeAudioData(arrayBuffer);
          const audioData = ab.getChannelData(0);
          await ac.close();

          const text = await transcribeAudio(audioData);

          // Filter out noise transcriptions from Whisper
          const NOISE_PATTERNS = /^\s*(\[.*?\]|\(.*?\)|\*.*?\*|music|laughter|applause|silence|noise|background)\s*$/i;
          const cleanText = text.trim();
          
          if (cleanText && !NOISE_PATTERNS.test(cleanText) && cleanText.length > 1 && isCallActiveRef.current) {
            setTranscript(cleanText);
            const screenshot = latestScreenshotRef.current || undefined;
            
            // Add user message to chat
            const userMsg: VoiceMessage = {
              id: crypto.randomUUID(), role: 'user', content: text.trim(),
              timestamp: Date.now(), isVoice: true, screenshot,
            };
            setCallMessages(prev => [...prev, userMsg]);

            const response = await onSendMessage(text.trim(), screenshot);

            if (response && isCallActiveRef.current) {
              const assistantMsg: VoiceMessage = {
                id: crypto.randomUUID(), role: 'assistant', content: response,
                timestamp: Date.now(), isVoice: true,
              };
              setCallMessages(prev => [...prev, assistantMsg]);
              onNewMessages?.(userMsg, assistantMsg);

              setCallState('speaking');
              if (isSpeakerOff) {
                // Skip TTS, go straight to next listen cycle
                if (pushToTalkRef.current) setCallState('waiting');
                else setTimeout(() => startListening(), 300);
              } else {
                speak(response, {
                  voice: ttsVoice, rate: ttsRate,
                  onEnd: () => {
                    if (isCallActiveRef.current) {
                      if (pushToTalkRef.current) setCallState('waiting');
                      else setTimeout(() => startListening(), 300);
                    }
                  },
                });
              }
            } else if (isCallActiveRef.current) {
              if (pushToTalkRef.current) setCallState('waiting');
              else setTimeout(() => startListening(), 500);
            }
          } else if (isCallActiveRef.current) {
            if (pushToTalkRef.current) setCallState('waiting');
            else setTimeout(() => startListening(), 500);
          }
        } catch (error) {
          console.error('Voice call error:', error);
          if (isCallActiveRef.current) {
            toast.error('Voice processing failed. Retrying...');
            if (pushToTalkRef.current) setCallState('waiting');
            else setTimeout(() => startListening(), 1000);
          }
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();

      if (!pushToTalkRef.current) {
        detectSilence(stream, () => { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); });
      }

      const maxDuration = pushToTalkRef.current ? 60000 : 30000;
      silenceTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      }, maxDuration);
    } catch (error) {
      console.error('Failed to start listening:', error);
      toast.error('Microphone access failed');
      if (isCallActiveRef.current) setTimeout(() => startListening(), 1000);
    }
  }, [onSendMessage, ttsVoice, ttsRate, detectSilence, isMuted, onNewMessages]);

  /* ---------------------------------------------------------------- */
  /*  Start / End Call                                                  */
  /* ---------------------------------------------------------------- */
  const startCall = useCallback(async () => {
    if (!canMakeCall) {
      const downloaded = getDownloadedModels();
      if (downloaded.length === 0) {
        toast.error('No voice model downloaded', {
          description: 'Go to Settings → Voice Models to download Whisper.',
          action: { label: 'Open Settings', onClick: () => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'voicemodels' } })) },
          duration: 5000,
        });
      } else {
        toast.error('Voice model not ready. Try again.');
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch { toast.error('Microphone access required for voice calls'); return; }

    isCallActiveRef.current = true;
    setIsInCall(true);
    setTranscript('');
    setLoadingMessage('');
    setCallStartTime(Date.now());
    setIsMinimized(false);

    if (!isWhisperLoaded()) {
      setCallState('loading');
      setLoadingMessage('Loading speech recognition...');
      const success = await loadWhisperModel(getSelectedWhisperModel(), (p) => { if (p.message) setLoadingMessage(p.message); });
      if (!success) {
        toast.error('Failed to load speech model');
        isCallActiveRef.current = false; setIsInCall(false); setCallState('idle');
        return;
      }
    }

    toast.success(`Voice call started — ${pushToTalk ? 'Hold Space to talk' : 'Speak anytime'}`, { duration: 2000 });
    if (pushToTalk) setCallState('waiting'); else startListening();
  }, [canMakeCall, startListening, pushToTalk]);

  const endCall = useCallback(() => {
    isCallActiveRef.current = false;
    setIsInCall(false);
    setCallState('idle');
    setTranscript('');
    stopScreenShare();
    onEnd?.();
    setLoadingMessage('');

    if (silenceTimeoutRef.current) { clearTimeout(silenceTimeoutRef.current); silenceTimeoutRef.current = null; }
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    stopSpeaking();
  }, [stopScreenShare, onEnd]);

  const stopListeningManually = useCallback(() => {
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Send Text Message During Call                                    */
  /* ---------------------------------------------------------------- */
  const handleSendText = useCallback(async () => {
    const text = textInput.trim();
    if (!text || !isCallActiveRef.current) return;
    setTextInput('');

    const screenshot = latestScreenshotRef.current || undefined;
    const userMsg: VoiceMessage = {
      id: crypto.randomUUID(), role: 'user', content: text,
      timestamp: Date.now(), isVoice: false, screenshot,
    };
    setCallMessages(prev => [...prev, userMsg]);

    setCallState('processing');
    try {
      const response = await onSendMessage(text, screenshot);
      if (response && isCallActiveRef.current) {
        const assistantMsg: VoiceMessage = {
          id: crypto.randomUUID(), role: 'assistant', content: response,
          timestamp: Date.now(), isVoice: false,
        };
        setCallMessages(prev => [...prev, assistantMsg]);
        onNewMessages?.(userMsg, assistantMsg);

        setCallState('speaking');
        if (isSpeakerOff) {
          if (pushToTalkRef.current) setCallState('waiting');
          else setTimeout(() => startListening(), 300);
        } else {
          speak(response, {
            voice: ttsVoice, rate: ttsRate,
            onEnd: () => {
              if (isCallActiveRef.current) {
                if (pushToTalkRef.current) setCallState('waiting');
                else setTimeout(() => startListening(), 300);
              }
            },
          });
        }
      }
    } catch { toast.error('Failed to send message'); }
  }, [textInput, onSendMessage, ttsVoice, ttsRate, startListening, onNewMessages]);

  /* ---------------------------------------------------------------- */
  /*  Phone Button (idle)                                              */
  /* ---------------------------------------------------------------- */
  const handlePhoneClick = () => {
    if (!canMakeCall) {
      toast.info('Download a voice model first', {
        description: 'Go to Settings → Voice Models to download Whisper for offline speech recognition.',
        action: {
          label: 'Open Settings',
          onClick: () => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'voicemodels' } })),
        },
        duration: 5000,
      });
      return;
    }
    startCall();
  };

  /* ---------------------------------------------------------------- */
  /*  Keyboard Shortcuts                                               */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!isInCall) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (pushToTalkRef.current) {
          if (callState === 'waiting' && !isHoldingSpace) { setIsHoldingSpace(true); startListening(); }
          else if (callState === 'speaking') { stopSpeaking(); setIsHoldingSpace(true); startListening(); }
        } else {
          if (callState === 'listening') stopListeningManually();
          else if (callState === 'speaking') { stopSpeaking(); startListening(); }
        }
      }
      if (e.code === 'Escape') { e.preventDefault(); endCall(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && pushToTalkRef.current && isHoldingSpace) {
        e.preventDefault(); setIsHoldingSpace(false);
        if (callState === 'listening') stopListeningManually();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [isInCall, callState, isHoldingSpace, stopListeningManually, startListening, endCall]);

  /* ---------------------------------------------------------------- */
  /*  Render: Idle (just the phone button)                             */
  /* ---------------------------------------------------------------- */
  if (!isInCall) {
    return (
      <Button
        variant="ghost" size="icon"
        className={cn('rounded-full transition-all', canMakeCall ? 'text-green-500 hover:text-green-400 hover:bg-green-500/10' : 'text-muted-foreground hover:text-foreground')}
        onClick={handlePhoneClick} disabled={disabled}
        title={canMakeCall ? 'Start voice call (offline)' : 'Setup required — click to learn more'}
      >
        <Phone className="w-5 h-5" />
      </Button>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: Active Call — Split Screen                               */
  /* ---------------------------------------------------------------- */
  const stateColor = callState === 'listening' ? 'from-green-500/20 to-green-600/10'
    : callState === 'speaking' ? 'from-purple-500/20 to-purple-600/10'
    : callState === 'processing' ? 'from-yellow-500/20 to-yellow-600/10'
    : 'from-muted/20 to-muted/10';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/98 backdrop-blur-md">
      {/* ── Top Toolbar (secondary controls only) ── */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border/50 bg-background/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn('w-2 h-2 rounded-full', callState === 'listening' ? 'bg-green-500 animate-pulse' : callState === 'speaking' ? 'bg-purple-500 animate-pulse' : callState === 'processing' ? 'bg-yellow-500 animate-pulse' : 'bg-muted-foreground')} />
          <span className="text-sm font-medium text-foreground">
            {callState === 'loading' ? 'Connecting...' : callState === 'listening' ? 'Listening' : callState === 'processing' ? 'Thinking' : callState === 'speaking' ? 'Speaking' : 'Ready'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Model selector */}
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-36 h-8 text-xs bg-muted/30 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Screen share */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isScreenSharing ? 'default' : 'ghost'} size="icon"
                className={cn('h-8 w-8', isScreenSharing && 'bg-blue-600 hover:bg-blue-500 text-primary-foreground')}
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              >
                {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isScreenSharing ? 'Stop screen share' : 'Share screen (vision models)'}</TooltipContent>
          </Tooltip>

          {/* Text input toggle */}
          <Button variant={showTextInput ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
            onClick={() => setShowTextInput(!showTextInput)}>
            <MessageSquare className="w-4 h-4" />
          </Button>

          {/* Push-to-talk */}
          <div className="flex items-center gap-1.5 bg-muted/30 rounded-full px-3 py-1 border border-border/30">
            <Hand className="w-3 h-3 text-muted-foreground" />
            <Label htmlFor="ptt-toggle" className="text-xs text-muted-foreground cursor-pointer">PTT</Label>
            <Switch id="ptt-toggle" checked={pushToTalk} onCheckedChange={setPushToTalk} className="scale-75" />
          </div>
        </div>
      </div>

      {/* ── Main Split Layout ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Chat History (60%) */}
        <div className="w-[60%] flex flex-col border-r border-border/30">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {callMessages.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Phone className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Start speaking — your conversation will appear here</p>
                </div>
              )}
              {callMessages.map((msg) => (
                <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md'
                  )}>
                    {msg.isVoice && (
                      <span className="inline-flex items-center gap-1 text-[10px] opacity-60 mb-1">
                        <Mic className="w-2.5 h-2.5" /> voice
                      </span>
                    )}
                    {msg.screenshot && (
                      <div className="mb-2">
                        <img src={msg.screenshot} alt="Screen capture" className="rounded-lg max-h-32 w-auto border border-border/20" />
                      </div>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              {callState === 'processing' && (
                <div className="flex justify-start">
                  <div className="bg-muted text-foreground rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
          </ScrollArea>

          {/* Text input (optional) */}
          {showTextInput && (
            <div className="p-3 border-t border-border/30">
              <form onSubmit={(e) => { e.preventDefault(); handleSendText(); }} className="flex gap-2">
                <Input
                  value={textInput} onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 h-9 text-sm bg-muted/30 border-border/50"
                />
                <Button type="submit" size="icon" className="h-9 w-9" disabled={!textInput.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Right: Controls (40%) */}
        <div className={cn('w-[40%] flex flex-col items-center justify-center p-6 bg-gradient-to-b', stateColor)}>
          {/* Waveform canvas */}
          <canvas ref={canvasRef} width={280} height={80}
            className="mb-6 rounded-xl opacity-80" />

          {/* Status orb */}
          <div className={cn(
            'w-28 h-28 rounded-full flex items-center justify-center mb-6 transition-all shadow-2xl',
            callState === 'loading' && 'bg-blue-500/20 border-2 border-blue-500/30',
            callState === 'listening' && 'bg-green-500/20 ring-4 ring-green-500/30 animate-pulse',
            callState === 'processing' && 'bg-yellow-500/20 border-2 border-yellow-500/30',
            callState === 'speaking' && 'bg-purple-500/20 ring-4 ring-purple-500/30 animate-pulse',
            callState === 'waiting' && 'bg-muted/50 border-2 border-dashed border-muted-foreground/30',
          )}>
            {callState === 'loading' && <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />}
            {callState === 'listening' && <Mic className="w-10 h-10 text-green-500" />}
            {callState === 'processing' && <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />}
            {callState === 'speaking' && <Volume2 className="w-10 h-10 text-purple-500" />}
            {callState === 'waiting' && <Hand className="w-10 h-10 text-muted-foreground" />}
          </div>

          {/* Status text */}
          <p className="text-lg font-medium mb-1">
            {callState === 'loading' ? 'Getting Ready...' : callState === 'listening' ? (pushToTalk ? 'Recording...' : 'Listening...') : callState === 'processing' ? 'Thinking...' : callState === 'speaking' ? 'Speaking...' : 'Ready'}
          </p>
          <p className="text-xs text-muted-foreground text-center mb-6">
            {callState === 'loading' && loadingMessage}
            {callState === 'listening' && (pushToTalk ? 'Release Space when done' : 'Speak now — Space to send early')}
            {callState === 'processing' && 'Processing your voice...'}
            {callState === 'speaking' && 'Space to interrupt • Esc to end'}
            {callState === 'waiting' && (isMuted ? 'Mic is muted' : 'Hold Space to speak')}
          </p>

          {/* Current transcript */}
          {transcript && (
            <div className="max-w-xs w-full mb-4 p-3 rounded-xl bg-muted/40 border border-border/30 backdrop-blur">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">You said</p>
              <p className="text-sm text-foreground">{transcript}</p>
            </div>
          )}

          {/* Screen share preview */}
          {isScreenSharing && screenPreview && (
            <div className="max-w-xs w-full mb-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Screen Preview</p>
              <img src={screenPreview} alt="Screen" className="rounded-lg border border-border/30 w-full" />
            </div>
          )}

          {/* Call action buttons (contextual) */}
          <div className="flex gap-3 mt-2">
            {callState === 'listening' && !pushToTalk && (
              <Button variant="secondary" size="sm" className="rounded-full px-5 gap-1.5" onClick={stopListeningManually}>
                <MicOff className="w-4 h-4" /> Done Speaking
              </Button>
            )}
            {callState === 'waiting' && pushToTalk && !isMuted && (
              <Button variant="secondary" size="sm" className="rounded-full px-5 gap-1.5"
                onMouseDown={() => { setIsHoldingSpace(true); startListening(); }}
                onMouseUp={() => { setIsHoldingSpace(false); stopListeningManually(); }}
                onMouseLeave={() => { if (isHoldingSpace) { setIsHoldingSpace(false); stopListeningManually(); } }}>
                <Mic className="w-4 h-4" /> Hold to Talk
              </Button>
            )}
            {callState === 'listening' && pushToTalk && (
              <Button variant="default" size="sm" className="rounded-full px-5 gap-1.5 bg-green-600 hover:bg-green-700 text-primary-foreground"
                onMouseUp={() => { setIsHoldingSpace(false); stopListeningManually(); }}>
                <Mic className="w-4 h-4 animate-pulse" /> Recording...
              </Button>
            )}
          </div>

          {/* Footer */}
          <p className="mt-auto pt-4 text-[10px] text-muted-foreground/60 text-center">
            🔒 Offline STT (Whisper) + Browser TTS<br />
            {pushToTalk ? 'Hold Space: record • Esc: end' : 'Space: toggle • Esc: end'}
          </p>
        </div>
      </div>

      {/* ── Floating Bottom Control Bar ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-full bg-card/90 backdrop-blur-xl border border-border shadow-2xl">
        {/* Mute mic */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-all',
                isMuted
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-muted/80 text-foreground hover:bg-muted'
              )}
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{isMuted ? 'Unmute mic' : 'Mute mic'}</TooltipContent>
        </Tooltip>

        {/* Hang Up */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center transition-all shadow-lg"
              onClick={endCall}
            >
              <PhoneOff className="w-7 h-7" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Hang up</TooltipContent>
        </Tooltip>

        {/* Speaker off */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-all',
                isSpeakerOff
                  ? 'bg-amber-500/20 text-amber-500 ring-2 ring-amber-500/40'
                  : 'bg-muted/80 text-foreground hover:bg-muted'
              )}
              onClick={() => {
                setIsSpeakerOff(!isSpeakerOff);
                if (!isSpeakerOff) stopSpeaking();
              }}
            >
              {isSpeakerOff ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{isSpeakerOff ? 'Turn speaker on' : 'Turn speaker off'}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
