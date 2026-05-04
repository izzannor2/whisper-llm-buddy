import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { speak, stopSpeaking, isTTSSupported } from '@/lib/tts';
import { toast } from 'sonner';

export interface VoiceCapabilities {
  speechRecognition: boolean;
  tts: boolean;
  micPermission: PermissionState | 'unknown';
}

export async function probeVoiceCapabilities(): Promise<VoiceCapabilities> {
  const speechRecognition =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const tts = isTTSSupported();
  let micPermission: PermissionState | 'unknown' = 'unknown';
  try {
    if (navigator.permissions) {
      const r = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      micPermission = r.state;
    }
  } catch {
    micPermission = 'unknown';
  }
  return { speechRecognition, tts, micPermission };
}

interface Props {
  onTranscript: (text: string) => void;
  speakText?: string;
}

export function VoiceControls({ onTranscript, speakText }: Props) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [caps, setCaps] = useState<VoiceCapabilities | null>(null);
  const recRef = useRef<any>(null);

  useEffect(() => { probeVoiceCapabilities().then(setCaps); }, []);

  const startListening = async () => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      toast.error('Speech recognition unavailable in this browser');
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('Microphone permission denied');
      return;
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript || '';
      if (text.trim()) onTranscript(text.trim());
    };
    rec.onerror = (e: any) => {
      toast.error(`Voice error: ${e.error || 'unknown'}`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stopListening = () => {
    try { recRef.current?.stop(); } catch {}
    setListening(false);
  };

  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (!speakText) {
      toast.message('Nothing to read yet');
      return;
    }
    setSpeaking(true);
    speak(speakText, { onEnd: () => setSpeaking(false) });
  };

  return (
    <div className="flex items-center gap-2" data-voice-controls="3d">
      <Button
        size="sm"
        variant={listening ? 'default' : 'outline'}
        onClick={listening ? stopListening : startListening}
        disabled={!caps?.speechRecognition}
        title={caps?.speechRecognition ? 'Voice prompt (push to talk)' : 'Speech recognition unavailable'}
      >
        {listening ? <MicOff className="w-4 h-4 mr-1.5" /> : <Mic className="w-4 h-4 mr-1.5" />}
        {listening ? 'Stop' : 'Speak'}
      </Button>
      <Button
        size="sm"
        variant={speaking ? 'default' : 'outline'}
        onClick={toggleSpeak}
        disabled={!caps?.tts}
        title={caps?.tts ? 'Read status aloud' : 'TTS unavailable'}
      >
        {speaking ? <VolumeX className="w-4 h-4 mr-1.5" /> : <Volume2 className="w-4 h-4 mr-1.5" />}
        {speaking ? 'Stop' : 'Read'}
      </Button>
    </div>
  );
}
