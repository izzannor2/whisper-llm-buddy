import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Moon, Sun, Wifi, WifiOff, RefreshCw, AlertTriangle, Cpu, Plug, FlaskConical, Brain, BookOpen, Shield, Server, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { IDESettings as IDESettingsType, IDEMode, ConnectionMode, LLMBackend, MODE_INFO, BOARD_TYPES, FRAMEWORKS, DEFAULT_SETTINGS } from '@/lib/ide-types';
import { getIDESettings, saveIDESettings } from '@/lib/ide-store';
import { listModels, isOllamaRunning, OllamaModel } from '@/lib/ollama-client';
import { isLlamaCppRunning, getLlamaCppServerInfo, generateLlamaServerCommand } from '@/lib/llama-cpp-client';
import { LocalModelPicker } from '@/components/LocalModelPicker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
export default function IDESettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<IDESettingsType>(DEFAULT_SETTINGS);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [llamaCppConnected, setLlamaCppConnected] = useState(false);
  const [llamaCppInfo, setLlamaCppInfo] = useState<{ model: string; ctx_size: number; n_threads: number } | null>(null);
  const [selectedGgufFile, setSelectedGgufFile] = useState<File | null>(null);

  useEffect(() => {
    setSettings(getIDESettings());
    checkConnections();
  }, []);

  const checkConnections = async () => {
    // Check Ollama
    const ollamaOk = await isOllamaRunning();
    setOllamaConnected(ollamaOk);
    if (ollamaOk) {
      const modelList = await listModels();
      setModels(modelList);
    }

    // Check llama.cpp
    const llamaOk = await isLlamaCppRunning();
    setLlamaCppConnected(llamaOk);
    if (llamaOk) {
      const info = await getLlamaCppServerInfo();
      setLlamaCppInfo(info);
    }
  };

  const checkOllama = async () => {
    const connected = await isOllamaRunning();
    setOllamaConnected(connected);
    if (connected) {
      const modelList = await listModels();
      setModels(modelList);
    }
  };

  const checkLlamaCpp = async () => {
    const connected = await isLlamaCppRunning();
    setLlamaCppConnected(connected);
    if (connected) {
      const info = await getLlamaCppServerInfo();
      setLlamaCppInfo(info);
      toast.success('Connected to llama.cpp server');
    } else {
      toast.error('Could not connect to llama.cpp server');
    }
  };

  const handleGgufSelected = (file: File) => {
    setSelectedGgufFile(file);
    updateSetting('llamaCppModel', file.name);
  };

  const copyLlamaCommand = () => {
    if (!selectedGgufFile) {
      toast.error('Please select a GGUF model file first');
      return;
    }
    const command = generateLlamaServerCommand(selectedGgufFile.name, {
      port: 8081,
      contextSize: settings.llamaCppContextSize,
      threads: settings.llamaCppThreads,
      gpuLayers: settings.llamaCppGpuLayers,
    });
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const updateSetting = <K extends keyof IDESettingsType>(key: K, value: IDESettingsType[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
  };

  const handleSave = () => {
    saveIDESettings(settings);
    toast.success('Settings saved');
  };

  const modeCards: { mode: IDEMode; icon: React.ReactNode }[] = [
    { mode: 'app-builder', icon: <Cpu className="h-5 w-5" /> },
    { mode: 'embedded-iot', icon: <Plug className="h-5 w-5" /> },
    { mode: 'system-helper', icon: <Shield className="h-5 w-5" /> },
    { mode: 'ai-improvement', icon: <Brain className="h-5 w-5" /> },
    { mode: 'learning', icon: <BookOpen className="h-5 w-5" /> },
    { mode: 'sandbox', icon: <FlaskConical className="h-5 w-5" /> },
    { mode: 'jailbreak', icon: <AlertTriangle className="h-5 w-5" /> },
    { mode: 'plugin', icon: <Plug className="h-5 w-5" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/ide')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
        <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" />Save</Button>
      </header>

      <ScrollArea className="h-[calc(100vh-56px)]">
        <div className="max-w-4xl mx-auto p-6 space-y-8">
          {/* Modes */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Mode</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {modeCards.map(({ mode, icon }) => (
                <Card
                  key={mode}
                  className={cn('cursor-pointer transition-all hover:border-primary/50', settings.mode === mode && 'border-primary bg-primary/5')}
                  onClick={() => updateSetting('mode', mode)}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-2">
                      {icon}
                      <CardTitle className="text-sm">{MODE_INFO[mode].name}</CardTitle>
                    </div>
                    <CardDescription className="text-xs">{MODE_INFO[mode].description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>

          <Separator />

          {/* LLM Backend */}
          <section>
            <h2 className="text-lg font-semibold mb-4">LLM Backend</h2>
            
            {/* Backend Selection */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Card
                className={cn('cursor-pointer transition-all hover:border-primary/50', settings.llmBackend === 'ollama' && 'border-primary bg-primary/5')}
                onClick={() => updateSetting('llmBackend', 'ollama')}
              >
                <CardHeader className="p-4">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    <CardTitle className="text-sm">Ollama</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Easy model management with ollama pull</CardDescription>
                </CardHeader>
              </Card>
              <Card
                className={cn('cursor-pointer transition-all hover:border-primary/50', settings.llmBackend === 'llama-cpp' && 'border-primary bg-primary/5')}
                onClick={() => updateSetting('llmBackend', 'llama-cpp')}
              >
                <CardHeader className="p-4">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    <CardTitle className="text-sm">Llama.cpp</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Direct GGUF model loading</CardDescription>
                </CardHeader>
              </Card>
            </div>

            {/* Connection Mode */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {(['offline', 'online-research', 'updating'] as ConnectionMode[]).map((m) => (
                <Card
                  key={m}
                  className={cn('cursor-pointer transition-all', settings.connectionMode === m && 'border-primary bg-primary/5')}
                  onClick={() => updateSetting('connectionMode', m)}
                >
                  <CardHeader className="p-4 text-center">
                    {m === 'offline' && <WifiOff className="h-6 w-6 mx-auto text-amber-500" />}
                    {m === 'online-research' && <Wifi className="h-6 w-6 mx-auto text-green-500" />}
                    {m === 'updating' && <RefreshCw className="h-6 w-6 mx-auto text-blue-500" />}
                    <CardTitle className="text-sm mt-2 capitalize">{m.replace('-', ' ')}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>

            {/* Ollama Settings */}
            {settings.llmBackend === 'ollama' && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Server className="h-4 w-4" /> Ollama Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div><Label>Ollama URL</Label><Input value={settings.ollamaUrl} onChange={(e) => updateSetting('ollamaUrl', e.target.value)} /></div>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', ollamaConnected ? 'bg-green-500' : 'bg-red-500')} />
                    <span className="text-sm">{ollamaConnected ? 'Connected' : 'Not connected'}</span>
                    <Button variant="outline" size="sm" onClick={checkOllama}>Test</Button>
                  </div>
                  {ollamaConnected && models.length > 0 && (
                    <div><Label>Model</Label>
                      <Select value={settings.selectedModel} onValueChange={(v) => updateSetting('selectedModel', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{models.map((m) => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Llama.cpp Settings */}
            {settings.llmBackend === 'llama-cpp' && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <HardDrive className="h-4 w-4" /> Llama.cpp Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div><Label>Server URL</Label><Input value={settings.llamaCppUrl} onChange={(e) => updateSetting('llamaCppUrl', e.target.value)} placeholder="http://127.0.0.1:8081" /></div>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', llamaCppConnected ? 'bg-green-500' : 'bg-red-500')} />
                    <span className="text-sm">{llamaCppConnected ? 'Connected' : 'Not connected'}</span>
                    <Button variant="outline" size="sm" onClick={checkLlamaCpp}>Test</Button>
                  </div>
                  
                  {llamaCppConnected && llamaCppInfo && (
                    <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 text-sm">
                      <p><strong>Model:</strong> {llamaCppInfo.model || 'Unknown'}</p>
                      <p><strong>Context:</strong> {llamaCppInfo.ctx_size} tokens</p>
                      <p><strong>Threads:</strong> {llamaCppInfo.n_threads}</p>
                    </div>
                  )}

                  <Separator />
                  
                  <div>
                    <Label className="mb-2 block">Select Local GGUF Model</Label>
                    <LocalModelPicker onModelSelected={handleGgufSelected} />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Context Size</Label>
                      <Input 
                        type="number" 
                        value={settings.llamaCppContextSize} 
                        onChange={(e) => updateSetting('llamaCppContextSize', parseInt(e.target.value) || 4096)} 
                      />
                    </div>
                    <div>
                      <Label>Threads</Label>
                      <Input 
                        type="number" 
                        value={settings.llamaCppThreads} 
                        onChange={(e) => updateSetting('llamaCppThreads', parseInt(e.target.value) || 4)} 
                      />
                    </div>
                    <div>
                      <Label>GPU Layers</Label>
                      <Input 
                        type="number" 
                        value={settings.llamaCppGpuLayers} 
                        onChange={(e) => updateSetting('llamaCppGpuLayers', parseInt(e.target.value) || 0)} 
                      />
                    </div>
                  </div>

                  {selectedGgufFile && (
                    <div className="space-y-2">
                      <Label>Startup Command</Label>
                      <div className="p-3 rounded bg-muted font-mono text-xs break-all">
                        {generateLlamaServerCommand(selectedGgufFile.name, {
                          port: 8081,
                          contextSize: settings.llamaCppContextSize,
                          threads: settings.llamaCppThreads,
                          gpuLayers: settings.llamaCppGpuLayers,
                        })}
                      </div>
                      <Button variant="outline" size="sm" onClick={copyLlamaCommand}>Copy Command</Button>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Install llama.cpp from <a href="https://github.com/ggerganov/llama.cpp" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">github.com/ggerganov/llama.cpp</a>
                  </p>
                </CardContent>
              </Card>
            )}
          </section>

          <Separator />

          {/* Editor */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Editor</h2>
            <div className="space-y-4">
              <div><Label>Font Size: {settings.fontSize}px</Label><Slider value={[settings.fontSize]} onValueChange={([v]) => updateSetting('fontSize', v)} min={10} max={24} step={1} /></div>
              <div className="flex items-center justify-between"><Label>Auto Save</Label><Switch checked={settings.autoSave} onCheckedChange={(v) => updateSetting('autoSave', v)} /></div>
            </div>
          </section>

          {settings.mode === 'embedded-iot' && (
            <>
              <Separator />
              <section>
                <h2 className="text-lg font-semibold mb-4">Embedded / IoT</h2>
                <div className="space-y-4">
                  <div><Label>Board Type</Label>
                    <Select value={settings.boardType} onValueChange={(v) => updateSetting('boardType', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{BOARD_TYPES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Serial Port</Label><Input value={settings.serialPort} onChange={(e) => updateSetting('serialPort', e.target.value)} /></div>
                  <div><Label>Build Command</Label><Input value={settings.buildCommand} onChange={(e) => updateSetting('buildCommand', e.target.value)} /></div>
                  <div><Label>Flash Command</Label><Input value={settings.flashCommand} onChange={(e) => updateSetting('flashCommand', e.target.value)} /></div>
                </div>
              </section>
            </>
          )}

          {settings.mode === 'jailbreak' && (
            <>
              <Separator />
              <section>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Jailbreak / Override</h2>
                <Card className="border-amber-500/50 bg-amber-500/5">
                  <CardContent className="p-4 space-y-4">
                    <p className="text-sm text-amber-400">⚠️ Advanced: Custom system prompts override default behavior.</p>
                    <div className="flex items-center justify-between"><Label>Enable Override</Label><Switch checked={settings.jailbreakEnabled} onCheckedChange={(v) => updateSetting('jailbreakEnabled', v)} /></div>
                    {settings.jailbreakEnabled && <Textarea value={settings.jailbreakPrompt} onChange={(e) => updateSetting('jailbreakPrompt', e.target.value)} placeholder="Enter custom system prompt..." rows={6} />}
                  </CardContent>
                </Card>
              </section>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
