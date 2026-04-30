import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Cloud, Server, HardDrive, CheckCircle, XCircle, Loader2, Usb, Monitor } from 'lucide-react';
import { ChatSettings, DEFAULT_SETTINGS, saveSettings } from '@/lib/chat-api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface FirstRunSetupProps {
  open: boolean;
  onComplete: (settings: ChatSettings) => void;
}

type Step = 'mode' | 'checklist' | 'backend' | 'apikey' | 'test';

const REQUIRED_DIRS = ['.ollama', 'models/ollama', 'models/gguf', 'public/updates', 'logs', 'config'];

export function FirstRunSetup({ open, onComplete }: FirstRunSetupProps) {
  const [step, setStep] = useState<Step>('mode');
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');
  const [dirStatus, setDirStatus] = useState<Record<string, boolean>>({});
  const [agentReachable, setAgentReachable] = useState<boolean | null>(null);

  // Probe agent /selftest to know which folders exist on disk
  useEffect(() => {
    if (step !== 'checklist') return;
    (async () => {
      try {
        const r = await fetch('http://127.0.0.1:3847/selftest', { signal: AbortSignal.timeout(2500) });
        if (!r.ok) { setAgentReachable(false); return; }
        const data = await r.json();
        const map: Record<string, boolean> = {};
        for (const c of data.checks || []) {
          if (c.name?.startsWith('dir:')) map[c.name.slice(4)] = !!c.ok;
        }
        setDirStatus(map);
        setAgentReachable(true);
      } catch {
        setAgentReachable(false);
      }
    })();
  }, [step]);

  const selectMode = (mode: 'portable' | 'installed') => {
    localStorage.setItem('localdev-portable-mode', mode === 'portable' ? 'true' : 'false');
    if (mode === 'portable') {
      // recommend Ollama by default for portable
      setSettings(prev => ({ ...prev, backend: 'ollama' }));
    }
    setStep('checklist');
  };

  const selectBackend = (backend: ChatSettings['backend']) => {
    setSettings(prev => ({ ...prev, backend }));
    if (backend === 'cloud') {
      setStep('test');
    } else if (['openai', 'anthropic', 'google', 'huggingface'].includes(backend)) {
      setStep('apikey');
    } else {
      setStep('test');
    }
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      if (settings.backend === 'ollama') {
        const res = await fetch(`${settings.ollamaUrl}/api/tags`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) { setTestStatus('success'); return; }
      } else if (settings.backend === 'local') {
        const res = await fetch(`${settings.localUrl}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) { setTestStatus('success'); return; }
      } else if (settings.backend === 'cloud') {
        clearTimeout(timeout);
        setTestStatus('success');
        return;
      } else {
        clearTimeout(timeout);
        const key = settings.apiKeys[settings.backend as keyof typeof settings.apiKeys];
        if (key) { setTestStatus('success'); return; }
      }
      setTestStatus('fail');
    } catch {
      setTestStatus('fail');
    }
  };

  const handleFinish = () => {
    saveSettings(settings);
    localStorage.setItem('localdev-first-run-complete', 'true');
    toast.success('Setup complete!');
    onComplete(settings);
  };

  const handleSkip = () => {
    localStorage.setItem('localdev-first-run-complete', 'true');
    onComplete(settings);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to AI Companion Hub</DialogTitle>
          <p className="text-sm text-muted-foreground">Let's get you set up in a few seconds.</p>
        </DialogHeader>

        {step === 'mode' && (
          <div className="space-y-3 mt-4">
            <p className="text-sm font-medium">How are you running this app?</p>
            <button
              className="w-full p-4 rounded-xl border-2 border-border hover:border-primary text-left transition-all"
              onClick={() => selectMode('portable')}
            >
              <Usb className="w-5 h-5 mb-1 text-primary" />
              <p className="font-medium text-sm">Portable Mode (USB / external drive)</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Models, logs, and updates stay inside the project folder. Recommended when running from a USB stick.
              </p>
            </button>
            <button
              className="w-full p-4 rounded-xl border-2 border-border hover:border-primary text-left transition-all"
              onClick={() => selectMode('installed')}
            >
              <Monitor className="w-5 h-5 mb-1 text-accent" />
              <p className="font-medium text-sm">Installed Mode</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Use system Ollama / global paths. Pick this if the app lives on a fixed install location.
              </p>
            </button>
            <Button variant="ghost" size="sm" className="w-full" onClick={handleSkip}>Skip setup</Button>
          </div>
        )}

        {step === 'checklist' && (
          <div className="space-y-3 mt-4">
            <p className="text-sm font-medium">Project folders</p>
            {agentReachable === false && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs">
                Local agent on :3847 unreachable — can't verify folders from the browser. The launcher
                (<code>START-PORTABLE-AI.bat</code>) creates these automatically on first run.
              </div>
            )}
            <div className="space-y-1">
              {REQUIRED_DIRS.map(d => {
                const ok = dirStatus[d];
                return (
                  <div key={d} className="flex items-center justify-between text-xs py-1">
                    <code className="text-muted-foreground">{d}/</code>
                    {agentReachable === null ? (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    ) : ok ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <span className="text-amber-400">missing</span>
                    )}
                  </div>
                );
              })}
            </div>
            <Button className="w-full" onClick={() => setStep('backend')}>Continue</Button>
          </div>
        )}

        {step === 'backend' && (
          <div className="space-y-3 mt-4">
            <p className="text-sm font-medium">Choose your AI backend:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'cloud' as const, icon: Cloud, label: 'Cloud', desc: 'Ready instantly', color: 'text-primary' },
                { id: 'ollama' as const, icon: HardDrive, label: 'Ollama', desc: 'Local models', color: 'text-purple-500' },
                { id: 'local' as const, icon: Server, label: 'Llama.cpp', desc: 'GGUF models', color: 'text-accent' },
                { id: 'openai' as const, icon: Server, label: 'OpenAI', desc: 'Needs API key', color: 'text-green-500' },
              ].map(b => (
                <button
                  key={b.id}
                  className={cn('p-3 rounded-xl border-2 text-left transition-all', 'border-border hover:border-primary')}
                  onClick={() => selectBackend(b.id)}
                >
                  <b.icon className={cn('w-5 h-5 mb-1', b.color)} />
                  <p className="font-medium text-sm">{b.label}</p>
                  <p className="text-[10px] text-muted-foreground">{b.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'apikey' && (
          <div className="space-y-4 mt-4">
            <p className="text-sm font-medium">Enter your API key for {settings.backend}:</p>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={settings.apiKeys[settings.backend as keyof typeof settings.apiKeys] || ''}
                onChange={e => setSettings(prev => ({
                  ...prev,
                  apiKeys: { ...prev.apiKeys, [prev.backend]: e.target.value }
                }))}
                placeholder="sk-..."
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('backend')}>Back</Button>
              <Button onClick={() => setStep('test')}>Next</Button>
            </div>
          </div>
        )}

        {step === 'test' && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{settings.backend}</Badge>
              <span className="text-sm text-muted-foreground">selected</span>
            </div>

            <Button onClick={handleTestConnection} disabled={testStatus === 'testing'} className="w-full">
              {testStatus === 'testing' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> :
               testStatus === 'success' ? <CheckCircle className="w-4 h-4 mr-2 text-green-500" /> :
               testStatus === 'fail' ? <XCircle className="w-4 h-4 mr-2 text-destructive" /> : null}
              {testStatus === 'testing' ? 'Testing...' : testStatus === 'success' ? 'Connected!' : testStatus === 'fail' ? 'Failed — try again' : 'Test Connection'}
            </Button>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('backend')}>Back</Button>
              <Button onClick={handleFinish}>
                Finish Setup
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
