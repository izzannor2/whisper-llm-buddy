import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Cloud, Server, HardDrive, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { ChatSettings, DEFAULT_SETTINGS, saveSettings } from '@/lib/chat-api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface FirstRunSetupProps {
  open: boolean;
  onComplete: (settings: ChatSettings) => void;
}

type Step = 'backend' | 'apikey' | 'test';

export function FirstRunSetup({ open, onComplete }: FirstRunSetupProps) {
  const [step, setStep] = useState<Step>('backend');
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');

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
        // Cloud is always available
        clearTimeout(timeout);
        setTestStatus('success');
        return;
      } else {
        // API key backends — just check key is non-empty
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

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Welcome to LocalDev AI</DialogTitle>
          <p className="text-sm text-muted-foreground">Let's get you set up in a few seconds.</p>
        </DialogHeader>

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
              <Button onClick={handleFinish} disabled={testStatus !== 'success'}>
                Finish Setup
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
