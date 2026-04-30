import { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, Sparkles, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  getTTSSettings,
  saveTTSSettings,
  speak,
  stop as stopTTS,
  getVoicesAsync,
} from '@/lib/tts-engine';

const CALIBRATION_KEY = 'voice-calibration-v1';

interface CalibrationResult {
  micDeviceId: string | null;
  micGain: number;
  noiseFloor: number;
  peakLevel: number;
  ttsVolume: number;
  ttsRate: number;
  voiceName: string | null;
  sttLatencyMs: number | null;
  completedAt: number;
}

type Step = 'intro' | 'mic-device' | 'mic-level' | 'speaker' | 'latency' | 'done';

function loadCalibration(): Partial<CalibrationResult> {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCalibration(c: CalibrationResult) {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(c));
}

export function VoiceCalibrationWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('intro');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [noise, setNoise] = useState(0);
  const [micGain, setMicGain] = useState(1);
  const [ttsVolume, setTtsVolume] = useState(1);
  const [ttsRate, setTtsRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string>('');
  const [latency, setLatency] = useState<number | null>(null);
  const [latencyTesting, setLatencyTesting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // Load existing calibration on open
  useEffect(() => {
    if (!open) return;
    const existing = loadCalibration();
    const tts = getTTSSettings();
    setMicGain(existing.micGain ?? 1);
    setTtsVolume(existing.ttsVolume ?? tts.volume);
    setTtsRate(existing.ttsRate ?? tts.rate);
    setVoiceName(existing.voiceName ?? tts.voice ?? '');
    setSelectedDeviceId(existing.micDeviceId ?? '');
    getVoicesAsync().then(setVoices);
  }, [open]);

  // Cleanup audio when dialog closes or step leaves mic
  const stopMic = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopMic();
      stopTTS();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      stopMic();
      stopTTS();
      setStep('intro');
      setLevel(0);
      setPeak(0);
      setNoise(0);
      setLatency(null);
    }
  }, [open]);

  // Enumerate devices when entering mic-device step
  useEffect(() => {
    if (step !== 'mic-device') return;
    (async () => {
      try {
        // Need permission to see labels
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach((t) => t.stop());
        const list = await navigator.mediaDevices.enumerateDevices();
        const mics = list.filter((d) => d.kind === 'audioinput');
        setDevices(mics);
        if (!selectedDeviceId && mics[0]) setSelectedDeviceId(mics[0].deviceId);
      } catch (e: any) {
        toast.error('Microphone permission denied', { description: e?.message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Start metering on mic-level step
  useEffect(() => {
    if (step !== 'mic-level') {
      stopMic();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let localPeak = 0;
        let noiseSamples: number[] = [];
        const start = performance.now();
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const amplified = Math.min(1, rms * micGain * 4);
          setLevel(amplified);
          if (amplified > localPeak) {
            localPeak = amplified;
            setPeak(localPeak);
          }
          // Sample noise floor in first 1.5s
          if (performance.now() - start < 1500) {
            noiseSamples.push(rms);
          } else if (noiseSamples.length) {
            const avg = noiseSamples.reduce((a, b) => a + b, 0) / noiseSamples.length;
            setNoise(avg);
            noiseSamples = [];
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (e: any) {
        toast.error('Could not access microphone', { description: e?.message });
      }
    })();
    return () => {
      cancelled = true;
      stopMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedDeviceId, micGain]);

  const playTestTone = () => {
    saveTTSSettings({ enabled: true, volume: ttsVolume, rate: ttsRate, voice: voiceName || null });
    speak(
      'This is a speaker test. If you can hear me clearly, your output is calibrated correctly.',
      { onEnd: () => {} }
    );
  };

  const runLatencyTest = async () => {
    setLatencyTesting(true);
    setLatency(null);
    try {
      const t0 = performance.now();
      // Cold-load Whisper pipeline check via dynamic import
      const mod = await import('@/lib/local-stt');
      // Touch the model selector to estimate readiness path
      mod.getSelectedWhisperModel();
      // Mic open latency
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const t1 = performance.now();
      stream.getTracks().forEach((t) => t.stop());
      const elapsed = Math.round(t1 - t0);
      setLatency(elapsed);
    } catch (e: any) {
      toast.error('Latency test failed', { description: e?.message });
    } finally {
      setLatencyTesting(false);
    }
  };

  const finish = () => {
    const result: CalibrationResult = {
      micDeviceId: selectedDeviceId || null,
      micGain,
      noiseFloor: noise,
      peakLevel: peak,
      ttsVolume,
      ttsRate,
      voiceName: voiceName || null,
      sttLatencyMs: latency,
      completedAt: Date.now(),
    };
    saveCalibration(result);
    saveTTSSettings({ volume: ttsVolume, rate: ttsRate, voice: voiceName || null });
    toast.success('Voice calibration saved', {
      description: `Mic gain ${micGain.toFixed(1)}x • Volume ${Math.round(ttsVolume * 100)}%`,
    });
    setOpen(false);
  };

  const noiseHigh = noise > 0.05;
  const peakLow = peak < 0.2;
  const peakClipping = peak > 0.95;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Calibrate Voice
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Voice Calibration Wizard
          </DialogTitle>
          <DialogDescription>
            Tune your microphone, speaker, and latency for the best voice-to-voice experience.
          </DialogDescription>
        </DialogHeader>

        {step === 'intro' && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              We'll quickly check your input device, set capture levels, test playback,
              and measure round-trip latency. Takes about 60 seconds.
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>Pick your microphone</li>
              <li>Set input gain & noise floor</li>
              <li>Set speaker volume & voice</li>
              <li>Measure mic + STT latency</li>
            </ul>
          </div>
        )}

        {step === 'mic-device' && (
          <div className="space-y-3 py-2">
            <Label>Microphone</Label>
            <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select microphone" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose the input you'll use for voice-to-voice. USB headsets give the best results.
            </p>
          </div>
        )}

        {step === 'mic-level' && (
          <div className="space-y-4 py-2">
            <div>
              <div className="flex justify-between mb-1">
                <Label>Live input level</Label>
                <span className="text-xs text-muted-foreground">peak {Math.round(peak * 100)}%</span>
              </div>
              <Progress value={level * 100} />
              <p className="text-xs text-muted-foreground mt-1">
                Speak at your normal volume. Aim for peaks between 40–80%.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Input gain</Label>
                <span className="text-sm text-muted-foreground">{micGain.toFixed(1)}x</span>
              </div>
              <Slider
                value={[micGain]}
                onValueChange={([v]) => setMicGain(v)}
                min={0.5}
                max={3}
                step={0.1}
              />
            </div>

            {noiseHigh && (
              <div className="flex items-start gap-2 text-xs text-yellow-500 bg-yellow-500/10 rounded p-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>High background noise detected. Move to a quieter spot or lower gain.</span>
              </div>
            )}
            {peakClipping && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded p-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Clipping detected. Reduce input gain.</span>
              </div>
            )}
            {!peakClipping && !noiseHigh && peak > 0.2 && (
              <div className="flex items-start gap-2 text-xs text-green-500 bg-green-500/10 rounded p-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Levels look good.</span>
              </div>
            )}
          </div>
        )}

        {step === 'speaker' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Voice</Label>
              <Select value={voiceName} onValueChange={setVoiceName}>
                <SelectTrigger>
                  <SelectValue placeholder="Default voice" />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
                    <SelectItem key={v.name} value={v.name}>
                      {v.name} ({v.lang}){v.localService ? ' ⚡' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Volume</Label>
                <span className="text-sm text-muted-foreground">{Math.round(ttsVolume * 100)}%</span>
              </div>
              <Slider value={[ttsVolume]} onValueChange={([v]) => setTtsVolume(v)} min={0} max={1} step={0.05} />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Speaking rate</Label>
                <span className="text-sm text-muted-foreground">{ttsRate.toFixed(1)}x</span>
              </div>
              <Slider value={[ttsRate]} onValueChange={([v]) => setTtsRate(v)} min={0.5} max={2} step={0.1} />
            </div>

            <Button variant="secondary" onClick={playTestTone} className="w-full gap-2">
              <Volume2 className="h-4 w-4" />
              Play test phrase
            </Button>
          </div>
        )}

        {step === 'latency' && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              We'll measure how quickly your microphone opens and Whisper is ready.
              Lower is better. Anything under 800ms is excellent.
            </p>
            <Button onClick={runLatencyTest} disabled={latencyTesting} className="w-full gap-2">
              {latencyTesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {latencyTesting ? 'Measuring…' : 'Run latency test'}
            </Button>
            {latency !== null && (
              <div className="text-center p-4 rounded-lg bg-muted">
                <div className="text-3xl font-bold">{latency} ms</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {latency < 400 ? 'Excellent' : latency < 800 ? 'Good' : latency < 1500 ? 'Acceptable' : 'Slow — consider Tiny model'}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-green-500">
              <Check className="h-5 w-5" /> Calibration complete
            </div>
            <div className="rounded-lg border p-3 space-y-1 text-muted-foreground">
              <div>Mic gain: <span className="text-foreground">{micGain.toFixed(1)}x</span></div>
              <div>Peak level: <span className="text-foreground">{Math.round(peak * 100)}%</span></div>
              <div>Noise floor: <span className="text-foreground">{(noise * 100).toFixed(1)}%</span></div>
              <div>Speaker volume: <span className="text-foreground">{Math.round(ttsVolume * 100)}%</span></div>
              <div>Speaking rate: <span className="text-foreground">{ttsRate.toFixed(1)}x</span></div>
              <div>Latency: <span className="text-foreground">{latency !== null ? `${latency} ms` : 'not measured'}</span></div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              const order: Step[] = ['intro', 'mic-device', 'mic-level', 'speaker', 'latency', 'done'];
              const i = order.indexOf(step);
              if (i > 0) setStep(order[i - 1]);
            }}
            disabled={step === 'intro'}
          >
            Back
          </Button>
          {step !== 'done' ? (
            <Button
              onClick={() => {
                const order: Step[] = ['intro', 'mic-device', 'mic-level', 'speaker', 'latency', 'done'];
                const i = order.indexOf(step);
                setStep(order[i + 1]);
              }}
            >
              {step === 'latency' ? 'Review' : 'Next'}
            </Button>
          ) : (
            <Button onClick={finish} className="gap-2">
              <Check className="h-4 w-4" />
              Save & Finish
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
