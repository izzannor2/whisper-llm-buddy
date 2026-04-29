import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileText, RefreshCw, CheckCircle2, XCircle, AlertCircle, ScrollText, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { runSelfTests, formatTestResults, type TestResult } from '@/lib/self-test';

const AGENT_URL = 'http://localhost:3847';
const LOG_NAMES = ['agent', 'web', 'llama', 'ollama', 'server'] as const;
type LogName = typeof LOG_NAMES[number];

interface LogPayload {
  name: string;
  file: string;
  exists: boolean;
  lines: string[];
  mtime: string | null;
  size: number;
  truncated?: boolean;
}

async function checkVoicePipelines(): Promise<TestResult[]> {
  const out: TestResult[] = [];

  // Browser SpeechSynthesis (TTS)
  const t0 = Date.now();
  const ttsOk = typeof window !== 'undefined' && 'speechSynthesis' in window;
  out.push({
    name: 'TTS: Web Speech',
    passed: ttsOk,
    message: ttsOk ? `${window.speechSynthesis.getVoices().length} voices available` : 'speechSynthesis unavailable',
    duration: Date.now() - t0,
  });

  // Microphone capability (STT input)
  const t1 = Date.now();
  let micOk = false;
  let micMsg = 'getUserMedia unavailable';
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      micOk = true;
      micMsg = 'microphone permission granted';
    }
  } catch (err) {
    micMsg = `microphone blocked: ${err instanceof Error ? err.message : 'unknown'}`;
  }
  out.push({ name: 'STT: Microphone', passed: micOk, message: micMsg, duration: Date.now() - t1 });

  // Web Speech recognition
  const t2 = Date.now();
  const sr = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  out.push({
    name: 'STT: Web Speech Recognition',
    passed: !!sr,
    message: sr ? 'available' : 'not supported in this browser',
    duration: Date.now() - t2,
  });

  // Whisper WASM presence (model file)
  const t3 = Date.now();
  let whisperOk = false;
  try {
    const r = await fetch('/models/whisper/whisper.wasm', { method: 'HEAD' });
    whisperOk = r.ok;
  } catch {}
  out.push({
    name: 'STT: Whisper WASM',
    passed: whisperOk,
    message: whisperOk ? 'whisper.wasm present' : 'optional — not found at /models/whisper/',
    duration: Date.now() - t3,
  });

  return out;
}

async function fetchLog(name: LogName): Promise<LogPayload> {
  const r = await fetch(`${AGENT_URL}/logs?name=${name}&lines=200`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchSelfTest(): Promise<{ ok: boolean; passed: number; total: number; checks: any[] } | null> {
  try {
    const r = await fetch(`${AGENT_URL}/selftest`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export function LauncherToolsDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'logs' | 'selftest'>('logs');
  const [logTab, setLogTab] = useState<LogName>('agent');
  const [logs, setLogs] = useState<Partial<Record<LogName, LogPayload>>>({});
  const [logLoading, setLogLoading] = useState(false);

  const [running, setRunning] = useState(false);
  const [appResults, setAppResults] = useState<TestResult[]>([]);
  const [voiceResults, setVoiceResults] = useState<TestResult[]>([]);
  const [serverReport, setServerReport] = useState<{ ok: boolean; passed: number; total: number; checks: any[] } | null>(null);
  const [serverUnavailable, setServerUnavailable] = useState(false);

  const loadLog = async (name: LogName) => {
    setLogLoading(true);
    try {
      const data = await fetchLog(name);
      setLogs(prev => ({ ...prev, [name]: data }));
    } catch (err) {
      toast.error(`Couldn't load ${name}.log`, {
        description: err instanceof Error ? err.message : 'Agent server may be offline',
      });
    } finally {
      setLogLoading(false);
    }
  };

  const onLogTabChange = (v: string) => {
    const n = v as LogName;
    setLogTab(n);
    if (!logs[n]) loadLog(n);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && tab === 'logs' && !logs[logTab]) loadLog(logTab);
  };

  const runAllTests = async () => {
    setRunning(true);
    setServerUnavailable(false);
    try {
      const [app, voice, server] = await Promise.all([
        runSelfTests(),
        checkVoicePipelines(),
        fetchSelfTest(),
      ]);
      setAppResults(app);
      setVoiceResults(voice);
      setServerReport(server);
      setServerUnavailable(!server);

      const totalPassed = app.filter(r => r.passed).length + voice.filter(r => r.passed).length + (server?.passed || 0);
      const totalAll = app.length + voice.length + (server?.total || 0);
      const allOk = app.every(r => r.passed) && voice.every(r => r.passed) && (server?.ok ?? false);
      if (allOk) {
        toast.success(`Self-test passed: ${totalPassed}/${totalAll}`);
      } else {
        toast.warning(`Self-test: ${totalPassed}/${totalAll} passed — see report`);
      }
    } finally {
      setRunning(false);
    }
  };

  const renderResultRow = (r: TestResult, idx: number) => (
    <div key={idx} className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/30 text-sm">
      {r.passed
        ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
        : <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="font-medium">{r.name}</div>
        <div className="text-xs text-muted-foreground break-words">{r.message}</div>
      </div>
      <Badge variant="outline" className="text-xs">{r.duration}ms</Badge>
    </div>
  );

  const renderServerCheck = (c: any, idx: number) => (
    <div key={idx} className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/30 text-sm">
      {c.ok
        ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
        : <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs">{c.name}</div>
        <div className="text-xs text-muted-foreground break-words">{c.message}</div>
      </div>
    </div>
  );

  const currentLog = logs[logTab];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          Launcher Tools
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Launcher Tools</DialogTitle>
          <DialogDescription>View runtime logs and run an offline self-test.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="logs"><ScrollText className="h-4 w-4 mr-1" /> Last Run Logs</TabsTrigger>
            <TabsTrigger value="selftest"><FlaskConical className="h-4 w-4 mr-1" /> Self-Test</TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Tabs value={logTab} onValueChange={onLogTabChange}>
                <TabsList>
                  {LOG_NAMES.map(n => (
                    <TabsTrigger key={n} value={n} className="capitalize">{n}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Button variant="ghost" size="sm" onClick={() => loadLog(logTab)} disabled={logLoading}>
                <RefreshCw className={`h-4 w-4 ${logLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-2">
              {currentLog?.exists === false && <span>No log file yet — start a run first.</span>}
              {currentLog?.mtime && <span>Updated {new Date(currentLog.mtime).toLocaleString()}</span>}
              {currentLog?.lines && <span>• {currentLog.lines.length} lines</span>}
              {currentLog?.truncated && <Badge variant="outline" className="text-xs">truncated</Badge>}
            </div>

            <ScrollArea className="h-[420px] rounded border bg-muted/20 p-3">
              {logLoading && !currentLog ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : currentLog?.lines?.length ? (
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                  {currentLog.lines.join('\n')}
                </pre>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {currentLog?.exists === false
                    ? `${logTab}.log doesn't exist yet.`
                    : 'No content. Make sure the local agent server (port 3847) is running.'}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="selftest" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Checks model files, ports, voice/STT/TTS pipelines, and core subsystems.
              </div>
              <Button onClick={runAllTests} disabled={running} size="sm">
                <FlaskConical className="h-4 w-4 mr-2" />
                {running ? 'Running…' : 'Run Self-Test'}
              </Button>
            </div>

            <ScrollArea className="h-[420px] rounded border bg-muted/20 p-3 space-y-4">
              {appResults.length === 0 && voiceResults.length === 0 && !serverReport && !serverUnavailable && (
                <div className="text-sm text-muted-foreground">Click "Run Self-Test" to begin.</div>
              )}

              {appResults.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    App Subsystems ({appResults.filter(r => r.passed).length}/{appResults.length})
                  </div>
                  {appResults.map(renderResultRow)}
                </div>
              )}

              {voiceResults.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    Voice Pipelines ({voiceResults.filter(r => r.passed).length}/{voiceResults.length})
                  </div>
                  {voiceResults.map(renderResultRow)}
                </div>
              )}

              {serverReport && (
                <div className="mt-4">
                  <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    Local Agent Checks ({serverReport.passed}/{serverReport.total})
                  </div>
                  {serverReport.checks.map(renderServerCheck)}
                </div>
              )}

              {serverUnavailable && (
                <div className="mt-4 p-3 rounded border border-amber-500/30 bg-amber-500/5 text-sm text-amber-300 flex gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    Local agent server (port 3847) is offline — model file & port checks were skipped.
                    Run <code className="font-mono">start-offline.bat</code> or <code className="font-mono">start.bat</code> first.
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
