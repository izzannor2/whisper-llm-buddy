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
  existingMessages?: VoiceMessage[];
  onNewMessages?: (userMsg: VoiceMessage, assistantMsg: VoiceMessage) => void;
  onMinimizedChange?: (minimized: boolean) => void;
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
  onMinimizedChange,
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

  // Notify parent of minimize state changes
  useEffect(() => { onMinimizedChange?.(isMinimized); }, [isMinimized, onMinimizedChange]);

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

  const [useBrowserSpeech, setUseBrowserSpeech] = useState(() => localStorage.getItem('voice-browser-speech') !== 'false');
  const speechRecognitionRef = useRef<any>(null);
  const browserTranscriptRef = useRef('');

  const whisperReady = isVoiceReady();
  const ttsReady = isTTSSupported();
  const browserSpeechSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const canMakeCall = (useBrowserSpeech && browserSpeechSupported) || whisperReady;

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
  /*  Orb colors based on state                                       */
  /* ---------------------------------------------------------------- */
  const orbConfig = {
    listening: { bg: 'bg-green-500/20', ring: 'ring-green-500/40', pulse: 'shadow-[0_0_60px_rgba(34,197,94,0.4)]', icon: <Mic className="w-10 h-10 text-green-400" />, label: pushToTalk ? 'Recording...' : 'Listening...' },
    speaking: { bg: 'bg-purple-500/20', ring: 'ring-purple-500/40', pulse: 'shadow-[0_0_60px_rgba(168,85,247,0.4)]', icon: <Volume2 className="w-10 h-10 text-purple-400" />, label: 'Speaking...' },
    processing: { bg: 'bg-yellow-500/20', ring: 'ring-yellow-500/40', pulse: 'shadow-[0_0_60px_rgba(234,179,8,0.3)]', icon: <Loader2 className="w-10 h-10 text-yellow-400 animate-spin" />, label: 'Thinking...' },
    loading: { bg: 'bg-blue-500/20', ring: 'ring-blue-500/40', pulse: '', icon: <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />, label: 'Connecting...' },
    waiting: { bg: 'bg-muted/40', ring: 'ring-muted-foreground/20', pulse: '', icon: <Hand className="w-10 h-10 text-muted-foreground" />, label: 'Ready' },
    idle: { bg: 'bg-muted/40', ring: 'ring-muted-foreground/20', pulse: '', icon: <Phone className="w-10 h-10 text-muted-foreground" />, label: 'Idle' },
  };
  const orb = orbConfig[callState] || orbConfig.idle;

  /* ---------------------------------------------------------------- */
  /*  Render: Minimized Pill                                           */
  /* ---------------------------------------------------------------- */
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-card/95 backdrop-blur-xl border border-border shadow-2xl animate-scale-in">
        {/* Status dot */}
        <div className={cn('w-3 h-3 rounded-full', callState === 'listening' ? 'bg-green-500 animate-pulse' : callState === 'speaking' ? 'bg-purple-500 animate-pulse' : callState === 'processing' ? 'bg-yellow-500 animate-pulse' : 'bg-muted-foreground')} />
        
        {/* Timer */}
        <span className="text-sm font-mono text-foreground tabular-nums">{callElapsed}</span>
        
        {/* Mute */}
        <button
          className={cn('w-9 h-9 rounded-full flex items-center justify-center transition-all', isMuted ? 'bg-destructive text-destructive-foreground' : 'bg-muted/80 text-foreground hover:bg-muted')}
          onClick={() => setIsMuted(!isMuted)}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        
        {/* Hang up */}
        <button
          className="w-9 h-9 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center transition-all"
          onClick={endCall}
        >
          <PhoneOff className="w-4 h-4" />
        </button>
        
        {/* Expand */}
        <button
          className="w-9 h-9 rounded-full bg-muted/80 text-foreground hover:bg-muted flex items-center justify-center transition-all"
          onClick={() => setIsMinimized(false)}
        >
          <ChevronDown className="w-4 h-4 rotate-180" />
        </button>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: Full-Screen ChatGPT/Grok Style                          */
  /* ---------------------------------------------------------------- */
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/98 backdrop-blur-md">
      {/* Top bar: timer + model + secondary controls */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-6 bg-background/60 backdrop-blur border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className={cn('w-2.5 h-2.5 rounded-full', callState === 'listening' ? 'bg-green-500 animate-pulse' : callState === 'speaking' ? 'bg-purple-500 animate-pulse' : callState === 'processing' ? 'bg-yellow-500 animate-pulse' : 'bg-muted-foreground')} />
          <span className="text-sm font-medium text-foreground">{orb.label}</span>
          <span className="text-sm font-mono text-muted-foreground tabular-nums">{callElapsed}</span>
        </div>

        <div className="flex items-center gap-2">
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
            <TooltipContent>{isScreenSharing ? 'Stop screen share' : 'Share screen'}</TooltipContent>
          </Tooltip>

          <Button variant={showTextInput ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setShowTextInput(!showTextInput)}>
            <MessageSquare className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-1.5 bg-muted/30 rounded-full px-3 py-1 border border-border/30">
            <Hand className="w-3 h-3 text-muted-foreground" />
            <Label htmlFor="ptt-toggle" className="text-xs text-muted-foreground cursor-pointer">PTT</Label>
            <Switch id="ptt-toggle" checked={pushToTalk} onCheckedChange={setPushToTalk} className="scale-75" />
          </div>
        </div>
      </div>

      {/* Center: Animated Orb */}
      <div className="flex flex-col items-center justify-center flex-1 pt-14 pb-48 gap-6">
        {/* Pulsing rings behind orb */}
        <div className="relative">
          {(callState === 'listening' || callState === 'speaking') && (
            <>
              <div className={cn('absolute inset-0 rounded-full animate-ping opacity-20', callState === 'listening' ? 'bg-green-500' : 'bg-purple-500')} style={{ animationDuration: '2s', transform: 'scale(1.4)' }} />
              <div className={cn('absolute inset-0 rounded-full animate-ping opacity-10', callState === 'listening' ? 'bg-green-500' : 'bg-purple-500')} style={{ animationDuration: '3s', transform: 'scale(1.8)' }} />
            </>
          )}
          <div className={cn(
            'w-36 h-36 rounded-full flex items-center justify-center transition-all duration-500 ring-4',
            orb.bg, orb.ring, orb.pulse,
          )}>
            {orb.icon}
          </div>
        </div>

        {/* Waveform canvas */}
        <canvas ref={canvasRef} width={320} height={60} className="rounded-xl opacity-70" />

        {/* Status text */}
        <div className="text-center">
          <p className="text-xl font-semibold text-foreground">{orb.label}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {callState === 'loading' && loadingMessage}
            {callState === 'listening' && (pushToTalk ? 'Release Space when done' : 'Speak naturally — pauses send')}
            {callState === 'processing' && 'Processing your voice...'}
            {callState === 'speaking' && 'Space to interrupt'}
            {callState === 'waiting' && (isMuted ? 'Mic is muted' : 'Hold Space to speak')}
          </p>
        </div>

        {/* Transcript preview */}
        {transcript && (
          <div className="max-w-sm w-full p-3 rounded-xl bg-muted/30 border border-border/30 backdrop-blur text-center">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">You said</p>
            <p className="text-sm text-foreground">{transcript}</p>
          </div>
        )}

        {/* Screen share preview */}
        {isScreenSharing && screenPreview && (
          <div className="max-w-xs">
            <img src={screenPreview} alt="Screen" className="rounded-lg border border-border/30 w-full max-h-28 object-cover" />
          </div>
        )}

        {/* PTT contextual button */}
        <div className="flex gap-3">
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
      </div>

      {/* Text input overlay (when toggled) */}
      {showTextInput && (
        <div className="absolute bottom-52 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
          <form onSubmit={(e) => { e.preventDefault(); handleSendText(); }} className="flex gap-2">
            <Input
              value={textInput} onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 h-10 text-sm bg-card/90 backdrop-blur-xl border-border/50"
              autoFocus
            />
            <Button type="submit" size="icon" className="h-10 w-10" disabled={!textInput.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}

      {/* Bottom Control Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-5 px-8 py-4 rounded-full bg-card/90 backdrop-blur-xl border border-border shadow-2xl">
        {/* Mute */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn('w-14 h-14 rounded-full flex items-center justify-center transition-all', isMuted ? 'bg-destructive text-destructive-foreground' : 'bg-muted/80 text-foreground hover:bg-muted')}
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{isMuted ? 'Unmute' : 'Mute'}</TooltipContent>
        </Tooltip>

        {/* Hang Up */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center transition-all shadow-lg" onClick={endCall}>
              <PhoneOff className="w-7 h-7" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Hang up</TooltipContent>
        </Tooltip>

        {/* Speaker off */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn('w-14 h-14 rounded-full flex items-center justify-center transition-all', isSpeakerOff ? 'bg-amber-500/20 text-amber-500 ring-2 ring-amber-500/40' : 'bg-muted/80 text-foreground hover:bg-muted')}
              onClick={() => { setIsSpeakerOff(!isSpeakerOff); if (!isSpeakerOff) stopSpeaking(); }}
            >
              {isSpeakerOff ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{isSpeakerOff ? 'Speaker on' : 'Speaker off'}</TooltipContent>
        </Tooltip>

        {/* Minimize */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="w-12 h-12 rounded-full bg-muted/80 text-foreground hover:bg-muted flex items-center justify-center transition-all" onClick={() => setIsMinimized(true)}>
              <ChevronDown className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Minimize call</TooltipContent>
        </Tooltip>
      </div>

      {/* Footer hint */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground/50">
        {pushToTalk ? 'Hold Space: record' : 'Space: toggle mic'} · Esc: end call · 🔒 Offline STT
      </div>
    </div>
  );
}
