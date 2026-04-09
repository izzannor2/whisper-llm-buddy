import { useState, useEffect } from 'react';
import { Cloud, Server, RefreshCw, Volume2, Play, Key, Mic, Bot, HardDrive, Cpu, Wifi, WifiOff, Download, Zap, Brain, Clock, Save, Bug, Shield, Upload, FileDown, Plug, Package, RotateCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ChatSettings, DEFAULT_SETTINGS, CLOUD_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS, GOOGLE_MODELS, DEFAULT_API_KEYS } from '@/lib/chat-api';
import { getAvailableVoices, speak, isTTSSupported } from '@/lib/tts';
import { ModelManager } from '@/components/ModelManager';
import { VoiceModelManager } from '@/components/VoiceModelManager';
import { DebugPanel } from '@/components/DebugPanel';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { handleExport, handleImportFromFile } from '@/lib/export-import';
import { getPermissions, savePermissions, toggleSafeMode } from '@/lib/permissions';
import { runSelfTests, formatTestResults, TestResult } from '@/lib/self-test';

interface SystemHealthStatus {
  ollama: 'online' | 'offline' | 'checking';
  llamaCpp: 'online' | 'offline' | 'checking';
  ollamaModel: string;
  llamaCppModel: string;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ChatSettings;
  onSave: (settings: ChatSettings) => void;
  initialTab?: string;
}

// No placeholder models - only show what's actually available

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
  initialTab,
}: SettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<ChatSettings>(settings);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isScanningOllama, setIsScanningOllama] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealthStatus>({
    ollama: 'checking', llamaCpp: 'checking', ollamaModel: '', llamaCppModel: ''
  });

  // Auto-scan system health when settings dialog opens
  useEffect(() => {
    if (!open) return;
    const isCloud = window.location.hostname.includes('lovable.app') || window.location.hostname.includes('lovableproject.com');
    if (isCloud) {
      setSystemHealth({ ollama: 'offline', llamaCpp: 'offline', ollamaModel: '', llamaCppModel: '' });
      return;
    }

    const scanHealth = async () => {
      setSystemHealth(prev => ({ ...prev, ollama: 'checking', llamaCpp: 'checking' }));
      
      // Check Ollama
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(`${localSettings.ollamaUrl || 'http://localhost:11434'}/api/tags`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          const data = await res.json();
          const models = data.models?.map((m: any) => m.name) || [];
          setSystemHealth(prev => ({ ...prev, ollama: 'online', ollamaModel: models[0] || '' }));
          if (models.length > 0 && ollamaModels.length === 0) setOllamaModels(models);
        } else {
          setSystemHealth(prev => ({ ...prev, ollama: 'offline' }));
        }
      } catch {
        setSystemHealth(prev => ({ ...prev, ollama: 'offline' }));
      }

      // Check Llama.cpp
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(`${localSettings.localUrl || 'http://127.0.0.1:8081'}/health`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          try {
            const mres = await fetch(`${localSettings.localUrl || 'http://127.0.0.1:8081'}/v1/models`, { signal: AbortSignal.timeout(3000) });
            if (mres.ok) {
              const mdata = await mres.json();
              const name = mdata.data?.[0]?.id || 'loaded';
              setSystemHealth(prev => ({ ...prev, llamaCpp: 'online', llamaCppModel: name }));
            } else {
              setSystemHealth(prev => ({ ...prev, llamaCpp: 'online', llamaCppModel: 'running' }));
            }
          } catch {
            setSystemHealth(prev => ({ ...prev, llamaCpp: 'online', llamaCppModel: 'running' }));
          }
        } else {
          setSystemHealth(prev => ({ ...prev, llamaCpp: 'offline' }));
        }
      } catch {
        setSystemHealth(prev => ({ ...prev, llamaCpp: 'offline' }));
      }
    };

    scanHealth();
  }, [open]);
  

  // Load available voices
  useEffect(() => {
    const loadVoices = async () => {
      const availableVoices = await getAvailableVoices();
      setVoices(availableVoices);
    };

    loadVoices();
  }, []);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    onSave(localSettings);
    onOpenChange(false);
  };

  const scanLocalModels = async () => {
    setIsScanning(true);
    try {
      const response = await fetch(`${localSettings.localUrl}/v1/models`);
      if (response.ok) {
        const data = await response.json();
        const models = data.data?.map((m: any) => m.id) || [];
        setLocalModels(models);
        toast.success(`Found ${models.length} model(s) on Llama.cpp`);
      } else {
        toast.error('Could not connect to Llama.cpp server');
      }
    } catch (err) {
      console.error('Failed to scan models:', err);
      toast.error('Llama.cpp server not reachable. Make sure llama-server is running.');
    }
    setIsScanning(false);
  };

  // Detect if running in cloud preview (cannot reach localhost)
  const isCloudPreview = () => {
    const hostname = window.location.hostname;
    return hostname.includes('lovable.app') || 
           hostname.includes('lovableproject.com') || 
           hostname.includes('lovable.dev');
  };

  const scanOllamaModels = async () => {
    setIsScanningOllama(true);
    const ollamaUrl = localSettings.ollamaUrl || 'http://localhost:11434';
    
    try {
      console.log('Scanning Ollama at:', ollamaUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        setOllamaModels(models);
        if (models.length > 0) {
          toast.success(`Found ${models.length} model(s) on Ollama`);
          // Auto-select first model if none selected
          if (!localSettings.ollamaModel) {
            setLocalSettings({ ...localSettings, ollamaModel: models[0] });
          }
        } else {
          toast.info('Ollama is running but no models installed. Run: ollama pull llama3.2');
        }
      } else {
        toast.error(`Ollama responded with error: ${response.status}`);
      }
    } catch (err: any) {
      console.error('Failed to scan Ollama models:', err);
      
      if (isCloudPreview()) {
        toast.error('Cannot reach localhost from cloud preview. Download and run this app locally to use Ollama.', {
          duration: 6000,
        });
      } else if (err.name === 'AbortError') {
        toast.error(`Ollama connection timed out. Check if Ollama is running on ${ollamaUrl}`, {
          duration: 5000,
        });
      } else {
        toast.error(
          <div className="space-y-1">
            <p className="font-medium">Ollama not reachable at {ollamaUrl}</p>
            <p className="text-xs opacity-80">
              1. Make sure Ollama is installed and running<br/>
              2. Run: <code className="bg-black/20 px-1 rounded">ollama serve</code><br/>
              3. Or use start.bat to auto-launch
            </p>
          </div>,
          { duration: 8000 }
        );
      }
    }
    setIsScanningOllama(false);
  };

  // Auto-scan when switching to Ollama backend
  useEffect(() => {
    if (localSettings.backend === 'ollama' && ollamaModels.length === 0) {
      scanOllamaModels();
    }
  }, [localSettings.backend]);

  // Get available models based on backend and whether API keys are configured
  const getAvailableModels = () => {
    switch (localSettings.backend) {
      case 'cloud':
        return CLOUD_MODELS;
      case 'openai':
        return localSettings.apiKeys.openai ? OPENAI_MODELS : [];
      case 'anthropic':
        return localSettings.apiKeys.anthropic ? ANTHROPIC_MODELS : [];
      case 'google':
        return localSettings.apiKeys.google ? GOOGLE_MODELS : [];
      case 'local':
        return localModels.map(m => ({ id: m, name: m, backend: 'local' }));
      case 'ollama':
        return ollamaModels.map(m => ({ id: m, name: m, backend: 'ollama' }));
      default:
        return [];
    }
  };

  const availableModels = getAvailableModels();

  const updateApiKey = (provider: keyof typeof DEFAULT_API_KEYS, value: string) => {
    setLocalSettings({
      ...localSettings,
      apiKeys: {
        ...localSettings.apiKeys,
        [provider]: value,
      },
    });
  };

  const getBackendLabel = (backend: string) => {
    switch (backend) {
      case 'local': return 'Llama.cpp';
      case 'ollama': return 'Ollama';
      case 'cloud': return 'Cloud';
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic';
      case 'google': return 'Google AI';
      case 'huggingface': return 'Hugging Face';
      default: return backend;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl glass-panel border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <p className="text-sm text-muted-foreground">Configure backend, models, voice, and more.</p>
        </DialogHeader>

        <Tabs defaultValue={initialTab || "backend"} key={initialTab} className="mt-4">
          <TabsList className="flex flex-wrap gap-1 h-auto bg-muted p-1">
            <TabsTrigger value="backend" className="text-xs">Backend</TabsTrigger>
            <TabsTrigger value="models" className="text-xs">Models</TabsTrigger>
            <TabsTrigger value="voicemodels" className="text-xs flex items-center gap-1">
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">Voice</span>
            </TabsTrigger>
            <TabsTrigger value="hardware" className="text-xs">Hardware</TabsTrigger>
            <TabsTrigger value="model" className="text-xs">Config</TabsTrigger>
            <TabsTrigger value="apikeys" className="text-xs">API Keys</TabsTrigger>
            <TabsTrigger value="voice" className="text-xs">TTS</TabsTrigger>
            <TabsTrigger value="prompt" className="text-xs">Prompt</TabsTrigger>
            <TabsTrigger value="debug" className="text-xs flex items-center gap-1">
              <Bug className="w-3 h-3" />
              <span className="hidden sm:inline">Debug</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="backend" className="space-y-4 mt-4">
            {/* System Status Panel */}
            <div className="grid grid-cols-2 gap-2 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", systemHealth.ollama === 'online' ? 'bg-green-500' : systemHealth.ollama === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-destructive')} />
                <span className="text-xs font-medium">Ollama</span>
                <span className="text-[10px] text-muted-foreground">
                  {systemHealth.ollama === 'online' ? systemHealth.ollamaModel || 'Ready' : systemHealth.ollama === 'checking' ? 'Scanning...' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", systemHealth.llamaCpp === 'online' ? 'bg-green-500' : systemHealth.llamaCpp === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-destructive')} />
                <span className="text-xs font-medium">Llama.cpp</span>
                <span className="text-[10px] text-muted-foreground">
                  {systemHealth.llamaCpp === 'online' ? systemHealth.llamaCppModel || 'Ready' : systemHealth.llamaCpp === 'checking' ? 'Scanning...' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button
                className={cn(
                  'p-3 rounded-xl border-2 transition-all text-left',
                  localSettings.backend === 'local'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground'
                )}
                onClick={() =>
                  setLocalSettings({ ...localSettings, backend: 'local', model: 'default' })
                }
              >
                <Server className="w-5 h-5 mb-1 text-accent" />
                <p className="font-medium text-sm">Llama.cpp</p>
                <p className="text-[10px] text-muted-foreground">GGUF models</p>
              </button>

              <button
                className={cn(
                  'p-3 rounded-xl border-2 transition-all text-left',
                  localSettings.backend === 'ollama'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground'
                )}
                onClick={() =>
                  setLocalSettings({ ...localSettings, backend: 'ollama', ollamaModel: 'llama3.2' })
                }
              >
                <HardDrive className="w-5 h-5 mb-1 text-purple-500" />
                <p className="font-medium text-sm">Ollama</p>
                <p className="text-[10px] text-muted-foreground">Easy models</p>
              </button>

              <button
                className={cn(
                  'p-3 rounded-xl border-2 transition-all text-left',
                  localSettings.backend === 'cloud'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground'
                )}
                onClick={() =>
                  setLocalSettings({ ...localSettings, backend: 'cloud', model: 'gemini-flash' })
                }
              >
                <Cloud className="w-5 h-5 mb-1 text-primary" />
                <p className="font-medium text-sm">Cloud</p>
                <p className="text-[10px] text-muted-foreground">Lovable AI</p>
              </button>

              <button
                className={cn(
                  'p-3 rounded-xl border-2 transition-all text-left',
                  localSettings.backend === 'openai'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground'
                )}
                onClick={() =>
                  setLocalSettings({ ...localSettings, backend: 'openai', model: 'gpt-4o' })
                }
              >
                <Bot className="w-5 h-5 mb-1 text-green-500" />
                <p className="font-medium text-sm">OpenAI</p>
                <p className="text-[10px] text-muted-foreground">GPT-4o</p>
              </button>

              <button
                className={cn(
                  'p-3 rounded-xl border-2 transition-all text-left',
                  localSettings.backend === 'anthropic'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground'
                )}
                onClick={() =>
                  setLocalSettings({ ...localSettings, backend: 'anthropic', model: 'claude-3-5-sonnet-20241022' })
                }
              >
                <Bot className="w-5 h-5 mb-1 text-orange-500" />
                <p className="font-medium text-sm">Anthropic</p>
                <p className="text-[10px] text-muted-foreground">Claude</p>
              </button>

              <button
                className={cn(
                  'p-3 rounded-xl border-2 transition-all text-left',
                  localSettings.backend === 'google'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground'
                )}
                onClick={() =>
                  setLocalSettings({ ...localSettings, backend: 'google', model: 'gemini-1.5-pro' })
                }
              >
                <Bot className="w-5 h-5 mb-1 text-blue-500" />
                <p className="font-medium text-sm">Google</p>
                <p className="text-[10px] text-muted-foreground">Gemini</p>
              </button>

              <button
                className={cn(
                  'p-3 rounded-xl border-2 transition-all text-left',
                  localSettings.backend === 'huggingface'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground'
                )}
                onClick={() =>
                  setLocalSettings({ ...localSettings, backend: 'huggingface' })
                }
              >
                <Bot className="w-5 h-5 mb-1 text-yellow-500" />
                <p className="font-medium text-sm">HuggingFace</p>
                <p className="text-[10px] text-muted-foreground">Any model</p>
              </button>
            </div>

            {localSettings.backend === 'local' && (
              <div className="space-y-2">
                <Label>Llama.cpp Server URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={localSettings.localUrl}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        localUrl: e.target.value,
                      })
                    }
                    placeholder="http://127.0.0.1:8081"
                    className="bg-muted"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={scanLocalModels}
                    disabled={isScanning}
                  >
                    <RefreshCw
                      className={cn('w-4 h-4', isScanning && 'animate-spin')}
                    />
                  </Button>
                </div>
                {localModels.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Found models: {localModels.join(', ')}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Run: <code className="bg-muted px-1 rounded">llama-server -m model.gguf --port 8081</code>
                </p>
              </div>
            )}

            {localSettings.backend === 'ollama' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Ollama URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.ollamaUrl}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          ollamaUrl: e.target.value,
                        })
                      }
                      placeholder="http://localhost:11434"
                      className="bg-muted"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={scanOllamaModels}
                      disabled={isScanningOllama}
                      title="Scan for available models"
                    >
                      <RefreshCw
                        className={cn('w-4 h-4', isScanningOllama && 'animate-spin')}
                      />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  {ollamaModels.length > 0 ? (
                    <select
                      value={localSettings.ollamaModel}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          ollamaModel: e.target.value,
                        })
                      }
                      className="w-full p-2 rounded-lg bg-muted border border-border"
                    >
                      {ollamaModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={localSettings.ollamaModel}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          ollamaModel: e.target.value,
                        })
                      }
                      placeholder="llama3.2"
                      className="bg-muted"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {ollamaModels.length > 0 
                      ? `${ollamaModels.length} model(s) available`
                      : 'Click refresh to scan for models, or enter manually'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pull models with: <code className="bg-muted px-1 rounded">ollama pull llama3.2</code>
                  </p>
                </div>
              </div>
            )}

            {['openai', 'anthropic', 'google', 'huggingface'].includes(localSettings.backend) && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground">
                  <Key className="w-3 h-3 inline mr-1" />
                  Using your own API key. Add it in the API Keys tab.
                  {localSettings.backend === 'huggingface' && ' Supports any model from Hugging Face Hub.'}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="models" className="mt-4">
            <ModelManager localUrl={localSettings.localUrl} />
          </TabsContent>

          <TabsContent value="voicemodels" className="mt-4">
            <VoiceModelManager />
          </TabsContent>

          <TabsContent value="model" className="space-y-4 mt-4">
            {localSettings.backend === 'huggingface' ? (
              <div className="space-y-2">
                <Label>Hugging Face Model</Label>
                <div className="space-y-2">
                  <Input
                    value={localSettings.huggingfaceModel}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, huggingfaceModel: e.target.value })
                    }
                    placeholder="org/model-name"
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter any model ID from huggingface.co/models (must support chat completions API)
                  </p>
                  {!localSettings.apiKeys.huggingface && (
                    <p className="text-xs text-destructive">
                      ⚠️ Add your Hugging Face API key in the API Keys tab to use this backend
                    </p>
                  )}
                </div>
              </div>
            ) : localSettings.backend === 'ollama' ? (
              <div className="space-y-2">
                <Label>Model</Label>
                {ollamaModels.length > 0 ? (
                  <select
                    value={localSettings.ollamaModel}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, ollamaModel: e.target.value })
                    }
                    className="w-full p-2 rounded-lg bg-muted border border-border"
                  >
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border border-border">
                    No models detected. Connect to Ollama and click refresh in the Backend tab.
                  </div>
                )}
              </div>
            ) : localSettings.backend === 'local' ? (
              <div className="space-y-2">
                <Label>Model</Label>
                {localModels.length > 0 ? (
                  <select
                    value={localSettings.model}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, model: e.target.value })
                    }
                    className="w-full p-2 rounded-lg bg-muted border border-border"
                  >
                    {localModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border border-border">
                    No models detected. Start llama-server and click refresh in the Backend tab.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Model</Label>
                {availableModels.length > 0 ? (
                  <select
                    value={localSettings.model}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, model: e.target.value })
                    }
                    className="w-full p-2 rounded-lg bg-muted border border-border"
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border border-border">
                    {['openai', 'anthropic', 'google'].includes(localSettings.backend) 
                      ? `Add your ${getBackendLabel(localSettings.backend)} API key in the API Keys tab to see available models.`
                      : 'No models available for this backend.'}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Temperature</Label>
                <span className="text-sm text-muted-foreground">
                  {localSettings.temperature.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[localSettings.temperature]}
                onValueChange={([v]) =>
                  setLocalSettings({ ...localSettings, temperature: v })
                }
                min={0}
                max={2}
                step={0.01}
                className="py-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Top P</Label>
                <span className="text-sm text-muted-foreground">
                  {localSettings.topP.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[localSettings.topP]}
                onValueChange={([v]) =>
                  setLocalSettings({ ...localSettings, topP: v })
                }
                min={0}
                max={1}
                step={0.01}
                className="py-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Max Tokens</Label>
                <span className="text-sm text-muted-foreground">
                  {localSettings.maxTokens}
                </span>
              </div>
              <Slider
                value={[localSettings.maxTokens]}
                onValueChange={([v]) =>
                  setLocalSettings({ ...localSettings, maxTokens: v })
                }
                min={256}
                max={8192}
                step={256}
                className="py-2"
              />
            </div>
          </TabsContent>

          <TabsContent value="apikeys" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-green-500" />
                  OpenAI API Key
                </Label>
                <Input
                  type="password"
                  value={localSettings.apiKeys.openai}
                  onChange={(e) => updateApiKey('openai', e.target.value)}
                  placeholder="sk-..."
                  className="bg-muted font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Get your key at platform.openai.com
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-orange-500" />
                  Anthropic API Key
                </Label>
                <Input
                  type="password"
                  value={localSettings.apiKeys.anthropic}
                  onChange={(e) => updateApiKey('anthropic', e.target.value)}
                  placeholder="sk-ant-..."
                  className="bg-muted font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Get your key at console.anthropic.com
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-blue-500" />
                  Google AI API Key
                </Label>
                <Input
                  type="password"
                  value={localSettings.apiKeys.google}
                  onChange={(e) => updateApiKey('google', e.target.value)}
                  placeholder="AIza..."
                  className="bg-muted font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Get your key at aistudio.google.com
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-yellow-500" />
                  Hugging Face Token
                </Label>
                <Input
                  type="password"
                  value={localSettings.apiKeys.huggingface}
                  onChange={(e) => updateApiKey('huggingface', e.target.value)}
                  placeholder="hf_..."
                  className="bg-muted font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Get your token at huggingface.co/settings/tokens
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border mt-4">
              <p className="text-xs text-muted-foreground">
                <Key className="w-3 h-3 inline mr-1" />
                API keys are stored locally in your browser and sent directly to the providers. 
                They never pass through our servers.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="voice" className="space-y-4 mt-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-border">
              <div className="flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">Auto-play responses</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically read AI responses aloud
                  </p>
                </div>
              </div>
              <Switch
                checked={localSettings.autoPlayTTS}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, autoPlayTTS: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border">
              <div className="flex items-center gap-3">
                <Mic className="w-5 h-5 text-accent" />
                <div>
                  <p className="font-medium">Voice Conversation</p>
                  <p className="text-xs text-muted-foreground">
                    Continue listening after AI speaks
                  </p>
                </div>
              </div>
              <Switch
                checked={localSettings.voiceConversation}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, voiceConversation: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Voice</Label>
              <div className="flex gap-2">
                <select
                  value={localSettings.ttsVoice}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, ttsVoice: e.target.value })
                  }
                  className="flex-1 p-2 rounded-lg bg-muted border border-border"
                >
                  <option value="">System Default</option>
                  {voices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => speak('Hello! This is a preview of the selected voice.', {
                    voice: localSettings.ttsVoice,
                    rate: localSettings.ttsRate,
                  })}
                  title="Preview voice"
                >
                  <Play className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Speech Rate</Label>
                <span className="text-sm text-muted-foreground">
                  {localSettings.ttsRate.toFixed(1)}x
                </span>
              </div>
              <Slider
                value={[localSettings.ttsRate]}
                onValueChange={([v]) =>
                  setLocalSettings({ ...localSettings, ttsRate: v })
                }
                min={0.5}
                max={2}
                step={0.1}
                className="py-2"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Uses your browser's built-in speech synthesis. Voice conversation mode 
              will auto-listen for your next message after the AI finishes speaking.
            </p>
          </TabsContent>

          <TabsContent value="prompt" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={localSettings.systemPrompt}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    systemPrompt: e.target.value,
                  })
                }
                placeholder="You are a helpful assistant..."
                className="min-h-[200px] bg-muted"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setLocalSettings({
                  ...localSettings,
                  systemPrompt: DEFAULT_SETTINGS.systemPrompt,
                })
              }
            >
              Reset to default
            </Button>
          </TabsContent>

          {/* Hardware Tab */}
          <TabsContent value="hardware" className="space-y-4 mt-4">
            {/* GPU Toggle */}
            <div className="p-4 rounded-xl border-2 border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    localSettings.useWebGPU ? "bg-primary/20" : "bg-muted"
                  )}>
                    <Cpu className={cn(
                      "w-5 h-5",
                      localSettings.useWebGPU ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <p className="font-medium">WebGPU Acceleration</p>
                    <p className="text-xs text-muted-foreground">
                      Use GPU for faster local AI inference
                    </p>
                  </div>
                </div>
                <Switch
                  checked={localSettings.useWebGPU}
                  onCheckedChange={(checked) => {
                    // Check if WebGPU is available
                    if (checked && !('gpu' in navigator)) {
                      toast.error('WebGPU is not supported in this browser');
                      return;
                    }
                    setLocalSettings({ ...localSettings, useWebGPU: checked });
                    if (checked) {
                      toast.success('WebGPU enabled! Restart local server with GPU support.');
                    }
                  }}
                />
              </div>
              {localSettings.useWebGPU && (
                <div className="mt-3 p-2 rounded-lg bg-primary/10 text-xs">
                  <p className="font-medium text-primary">GPU Mode Active</p>
                  <p className="text-muted-foreground mt-1">
                    For llama.cpp, use: <code className="bg-muted px-1 rounded">--n-gpu-layers 99</code>
                  </p>
                </div>
              )}
            </div>

            {/* Offline Toggle */}
            <div className="p-4 rounded-xl border-2 border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    localSettings.offlineMode ? "bg-orange-500/20" : "bg-muted"
                  )}>
                    {localSettings.offlineMode ? (
                      <WifiOff className="w-5 h-5 text-orange-500" />
                    ) : (
                      <Wifi className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">Offline Mode</p>
                    <p className="text-xs text-muted-foreground">
                      Disable all cloud/internet connections
                    </p>
                  </div>
                </div>
                <Switch
                  checked={localSettings.offlineMode}
                  onCheckedChange={(checked) => {
                    setLocalSettings({ 
                      ...localSettings, 
                      offlineMode: checked,
                      // Force local backend when going offline
                      backend: checked ? 'local' : localSettings.backend,
                    });
                    if (checked) {
                      toast.success('Offline mode enabled. Using local backend only.');
                    } else {
                      toast.success('Online mode restored.');
                    }
                  }}
                />
              </div>
              {localSettings.offlineMode && (
                <div className="mt-3 p-2 rounded-lg bg-orange-500/10 text-xs">
                  <p className="font-medium text-orange-500">Offline Mode Active</p>
                  <p className="text-muted-foreground mt-1">
                    Only local llama.cpp backend is available. Cloud features disabled.
                  </p>
                </div>
              )}
            </div>

            {/* Local Server URL (shown when offline) */}
            {localSettings.offlineMode && (
              <div className="space-y-2">
                <Label>Local Server URL</Label>
                <Input
                  value={localSettings.localUrl}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, localUrl: e.target.value })
                  }
                  placeholder="http://127.0.0.1:8081"
                  className="bg-muted"
                />
                <p className="text-[10px] text-muted-foreground">
                  Make sure llama.cpp server is running at this address
                </p>
              </div>
            )}

            {/* OpenClaw Section */}
            <div className="border-t border-border pt-4 mt-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                OpenClaw Agent
              </h3>

              {/* OpenClaw Enable/Disable */}
              <div className="p-4 rounded-xl border-2 border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      localSettings.openClawEnabled ? "bg-primary/20" : "bg-muted"
                    )}>
                      <Zap className={cn(
                        "w-5 h-5",
                        localSettings.openClawEnabled ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <p className="font-medium">OpenClaw Agent</p>
                      <p className="text-xs text-muted-foreground">
                        Sandboxed AI assistant for file ops & commands
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={localSettings.openClawEnabled ?? false}
                    onCheckedChange={(checked) => {
                      setLocalSettings({ ...localSettings, openClawEnabled: checked });
                      if (checked) {
                        toast.success('OpenClaw enabled! Click ⚡ to open overlay.');
                      } else {
                        toast.success('OpenClaw disabled.');
                      }
                    }}
                  />
                </div>
                {localSettings.openClawEnabled && (
                  <div className="mt-3 p-2 rounded-lg bg-primary/10 text-xs">
                    <p className="font-medium text-primary">Agent Active</p>
                    <p className="text-muted-foreground mt-1">
                      Hotkey: <code className="bg-muted px-1 rounded">Ctrl+Shift+X</code> to kill
                    </p>
                  </div>
                )}
              </div>

              {/* OpenClaw Settings (only shown when enabled) */}
              {localSettings.openClawEnabled && (
                <div className="space-y-3 mt-3">
                  {/* Model Selection */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-500" />
                      OpenClaw Model
                    </Label>
                    {ollamaModels.length > 0 ? (
                      <select
                        value={localSettings.openClawModel ?? ollamaModels[0]}
                        onChange={(e) =>
                          setLocalSettings({ ...localSettings, openClawModel: e.target.value })
                        }
                        className="w-full p-2 rounded-lg bg-muted border border-border"
                      >
                        {ollamaModels.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border border-border">
                        No Ollama models detected. Connect to Ollama and scan for models in the Backend tab.
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Requires Ollama running with the selected model
                    </p>
                  </div>

                  {/* Auto-Backup Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-2">
                      <Save className="w-4 h-4 text-accent" />
                      <div>
                        <p className="text-sm font-medium">Auto-Backup</p>
                        <p className="text-[10px] text-muted-foreground">
                          Backup files before AI edits
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={localSettings.openClawAutoBackup ?? true}
                      onCheckedChange={(checked) =>
                        setLocalSettings({ ...localSettings, openClawAutoBackup: checked })
                      }
                    />
                  </div>

                  {/* Habit Learning Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-500" />
                      <div>
                        <p className="text-sm font-medium">Habit Learning</p>
                        <p className="text-[10px] text-muted-foreground">
                          Learn & suggest frequent commands
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={localSettings.openClawLearning ?? true}
                      onCheckedChange={(checked) =>
                        setLocalSettings({ ...localSettings, openClawLearning: checked })
                      }
                    />
                  </div>

                  {/* Murmur Updates Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Murmur Updates</p>
                        <p className="text-[10px] text-muted-foreground">
                          Soft status updates while idle
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={localSettings.openClawMurmur ?? true}
                      onCheckedChange={(checked) =>
                        setLocalSettings({ ...localSettings, openClawMurmur: checked })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="debug" className="mt-4 space-y-4">
            <DebugPanel />

            {/* Self-Test */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm">Self-Test Suite</h4>
              <Button size="sm" onClick={async () => {
                const results = await runSelfTests();
                toast.success(formatTestResults(results));
              }}>
                Run Self-Tests
              </Button>
            </div>

            {/* Safe Mode */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Safe Mode</p>
                    <p className="text-[10px] text-muted-foreground">Block destructive file & system operations</p>
                  </div>
                </div>
                <Switch checked={getPermissions().safeMode} onCheckedChange={() => { toggleSafeMode(); toast.success('Safe mode toggled'); }} />
              </div>
            </div>

            {/* Export / Import */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm">Data Export / Import</h4>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={async () => { await handleExport(); toast.success('Data exported'); }}>
                  <FileDown className="w-3 h-3 mr-1" /> Export All
                </Button>
                <Button variant="outline" size="sm" onClick={async () => {
                  const result = await handleImportFromFile();
                  if (result.errors.length > 0) toast.error(result.errors[0]);
                  else toast.success(`Imported ${result.imported} items`);
                }}>
                  <Upload className="w-3 h-3 mr-1" /> Import
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Exports conversations, memories, settings, feedback, and tool stats as a single JSON file.</p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}