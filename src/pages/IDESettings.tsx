import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Wifi, WifiOff, RefreshCw, AlertTriangle, Cpu, Plug, FlaskConical, Brain, BookOpen, Shield, Server, HardDrive, Globe, Copy, QrCode, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { IDESettings as IDESettingsType, IDEMode, ConnectionMode, MODE_INFO, BOARD_TYPES, DEFAULT_SETTINGS } from '@/lib/ide-types';
import { getIDESettings, saveIDESettings } from '@/lib/ide-store';
import { listModels, isOllamaRunning, OllamaModel } from '@/lib/ollama-client';
import { isLlamaCppRunning, getLlamaCppServerInfo, generateLlamaServerCommand } from '@/lib/llama-cpp-client';
import { LocalModelPicker } from '@/components/LocalModelPicker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/SettingsDialog';
import { LauncherToolsDialog } from '@/components/LauncherToolsDialog';
import { VoiceCalibrationWizard } from '@/components/VoiceCalibrationWizard';
import { ModelRoutingPanel } from '@/components/ModelRoutingPanel';
import { ModelManager } from '@/components/ModelManager';
import { UpdatesPanel } from '@/components/settings/UpdatesPanel';
import { DiagnosticsPanel } from '@/components/settings/DiagnosticsPanel';
import { loadSettings as loadChatSettings, saveSettings as saveChatSettings, type ChatSettings } from '@/lib/chat-api';
import { SystemStatusBar } from '@/components/SystemStatusBar';

async function detectLocalIP(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (m && !m[1].startsWith('0.') && m[1] !== '0.0.0.0') { resolve(m[1]); pc.close(); }
      };
      setTimeout(() => { pc.close(); resolve('Unable to detect'); }, 5000);
    } catch { resolve('Unable to detect'); }
  });
}

const TOP_TABS = ['general', 'models', 'routing', 'voice', 'updates', 'diagnostics', 'advanced'] as const;
type TopTab = typeof TOP_TABS[number];

export default function IDESettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialChatTab = searchParams.get('tab') || undefined;
  const initialTopRaw = (searchParams.get('top') || 'general') as TopTab;
  const initialTop: TopTab = TOP_TABS.includes(initialTopRaw) ? initialTopRaw : 'general';

  const [settings, setSettings] = useState<IDESettingsType>(DEFAULT_SETTINGS);
  const [chatSettings, setChatSettings] = useState<ChatSettings>(() => loadChatSettings());
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [llamaCppConnected, setLlamaCppConnected] = useState(false);
  const [llamaCppInfo, setLlamaCppInfo] = useState<{ model: string; ctx_size: number; n_threads: number } | null>(null);
  const [selectedGgufFile, setSelectedGgufFile] = useState<File | null>(null);
  const [localIP, setLocalIP] = useState('Detecting...');
  const [devPort] = useState('8080');

  useEffect(() => {
    setSettings(getIDESettings());
    checkConnections();
    detectLocalIP().then(setLocalIP);
  }, []);

  const checkConnections = async () => {
    const ollamaOk = await isOllamaRunning();
    setOllamaConnected(ollamaOk);
    if (ollamaOk) setModels(await listModels());
    const llamaOk = await isLlamaCppRunning();
    setLlamaCppConnected(llamaOk);
    if (llamaOk) setLlamaCppInfo(await getLlamaCppServerInfo());
  };

  const updateSetting = <K extends keyof IDESettingsType>(key: K, value: IDESettingsType[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => { saveIDESettings(settings); toast.success('Settings saved'); };
  const handleChatSettingsSave = (next: ChatSettings) => { setChatSettings(next); saveChatSettings(next); };

  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success('Copied'); };

  const handleGgufSelected = async (file: File) => {
    setSelectedGgufFile(file);
    updateSetting('llamaCppModel', file.name);
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
  const lanUrl = `http://${localIP}:${devPort}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/ide')}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
        <div className="flex items-center gap-2">
          <SystemStatusBar compact />
          <VoiceCalibrationWizard />
          <LauncherToolsDialog />
          <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" />Save</Button>
        </div>
      </header>

      <ScrollArea className="h-[calc(100vh-56px)]">
        <div className="max-w-5xl mx-auto p-6">
          <Tabs defaultValue={initialTop} className="space-y-6">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="models">Models</TabsTrigger>
              <TabsTrigger value="routing">Model Routing</TabsTrigger>
              <TabsTrigger value="voice">Voice</TabsTrigger>
              <TabsTrigger value="updates">Updates</TabsTrigger>
              <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            {/* GENERAL — mode, backend choice, editor, remote access */}
            <TabsContent value="general" className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold mb-4">Mode</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {modeCards.map(({ mode, icon }) => (
                    <Card key={mode} className={cn('cursor-pointer transition-all hover:border-primary/50', settings.mode === mode && 'border-primary bg-primary/5')} onClick={() => updateSetting('mode', mode)}>
                      <CardHeader className="p-4">
                        <div className="flex items-center gap-2">{icon}<CardTitle className="text-sm">{MODE_INFO[mode].name}</CardTitle></div>
                        <CardDescription className="text-xs">{MODE_INFO[mode].description}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </section>

              <Separator />

              <section>
                <h2 className="text-lg font-semibold mb-4">LLM Backend</h2>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <Card className={cn('cursor-pointer transition-all hover:border-primary/50', settings.llmBackend === 'ollama' && 'border-primary bg-primary/5')} onClick={() => updateSetting('llmBackend', 'ollama')}>
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-2"><Server className="h-5 w-5" /><CardTitle className="text-sm">Ollama</CardTitle></div>
                      <CardDescription className="text-xs">Easy model management with ollama pull</CardDescription>
                    </CardHeader>
                  </Card>
                  <Card className={cn('cursor-pointer transition-all hover:border-primary/50', settings.llmBackend === 'llama-cpp' && 'border-primary bg-primary/5')} onClick={() => updateSetting('llmBackend', 'llama-cpp')}>
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-2"><HardDrive className="h-5 w-5" /><CardTitle className="text-sm">Llama.cpp</CardTitle></div>
                      <CardDescription className="text-xs">Direct GGUF model loading</CardDescription>
                    </CardHeader>
                  </Card>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                  {(['offline', 'online-research', 'updating'] as ConnectionMode[]).map((m) => (
                    <Card key={m} className={cn('cursor-pointer transition-all', settings.connectionMode === m && 'border-primary bg-primary/5')} onClick={() => updateSetting('connectionMode', m)}>
                      <CardHeader className="p-4 text-center">
                        {m === 'offline' && <WifiOff className="h-6 w-6 mx-auto text-amber-500" />}
                        {m === 'online-research' && <Wifi className="h-6 w-6 mx-auto text-green-500" />}
                        {m === 'updating' && <RefreshCw className="h-6 w-6 mx-auto text-blue-500" />}
                        <CardTitle className="text-sm mt-2 capitalize">{m.replace('-', ' ')}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>

                {settings.llmBackend === 'ollama' && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4" /> Ollama Configuration</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div><Label>Ollama URL</Label><Input value={settings.ollamaUrl} onChange={(e) => updateSetting('ollamaUrl', e.target.value)} /></div>
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2 h-2 rounded-full', ollamaConnected ? 'bg-green-500' : 'bg-red-500')} />
                        <span className="text-sm">{ollamaConnected ? 'Connected' : 'Not connected'}</span>
                        <Button variant="outline" size="sm" onClick={checkConnections}>Test</Button>
                      </div>
                      {ollamaConnected && models.length > 0 && (
                        <div><Label>Default Model (legacy field)</Label>
                          <Select value={settings.selectedModel} onValueChange={(v) => updateSetting('selectedModel', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{models.map((m) => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-1">Per-role assignments live in the Model Routing tab.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {settings.llmBackend === 'llama-cpp' && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><HardDrive className="h-4 w-4" /> Llama.cpp Configuration</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div><Label>Server URL</Label><Input value={settings.llamaCppUrl} onChange={(e) => updateSetting('llamaCppUrl', e.target.value)} placeholder="http://127.0.0.1:8081" /></div>
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2 h-2 rounded-full', llamaCppConnected ? 'bg-green-500' : 'bg-amber-500')} />
                        <span className="text-sm">{llamaCppConnected ? 'Connected' : 'Not running'}</span>
                        <Button variant="outline" size="sm" onClick={checkConnections}>Test</Button>
                      </div>
                      {llamaCppConnected && llamaCppInfo && (
                        <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 text-sm">
                          <p><strong>Model:</strong> {llamaCppInfo.model || 'Unknown'}</p>
                          <p><strong>Context:</strong> {llamaCppInfo.ctx_size} tokens</p>
                        </div>
                      )}
                      <Separator />
                      <div><Label className="mb-2 block">Select Local GGUF Model</Label><LocalModelPicker onModelSelected={handleGgufSelected} /></div>
                      <div className="grid grid-cols-3 gap-3">
                        <div><Label>Context Size</Label><Input type="number" value={settings.llamaCppContextSize} onChange={(e) => updateSetting('llamaCppContextSize', parseInt(e.target.value) || 4096)} /></div>
                        <div><Label>Threads</Label><Input type="number" value={settings.llamaCppThreads} onChange={(e) => updateSetting('llamaCppThreads', parseInt(e.target.value) || 4)} /></div>
                        <div><Label>GPU Layers</Label><Input type="number" value={settings.llamaCppGpuLayers} onChange={(e) => updateSetting('llamaCppGpuLayers', parseInt(e.target.value) || 0)} /></div>
                      </div>
                      {selectedGgufFile && (
                        <div className="space-y-2">
                          <Label>Startup Command</Label>
                          <div className="p-3 rounded bg-muted font-mono text-xs break-all">
                            {generateLlamaServerCommand(selectedGgufFile.name, { port: 8081, contextSize: settings.llamaCppContextSize, threads: settings.llamaCppThreads, gpuLayers: settings.llamaCppGpuLayers })}
                          </div>
                          <Button variant="outline" size="sm" onClick={() => copy(generateLlamaServerCommand(selectedGgufFile.name, { port: 8081, contextSize: settings.llamaCppContextSize, threads: settings.llamaCppThreads, gpuLayers: settings.llamaCppGpuLayers }))}>Copy Command</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </section>

              <Separator />

              <section>
                <h2 className="text-lg font-semibold mb-4">Editor</h2>
                <div className="space-y-4">
                  <div><Label>Font Size: {settings.fontSize}px</Label><Slider value={[settings.fontSize]} onValueChange={([v]) => updateSetting('fontSize', v)} min={10} max={24} step={1} /></div>
                  <div className="flex items-center justify-between"><Label>Auto Save</Label><Switch checked={settings.autoSave} onCheckedChange={(v) => updateSetting('autoSave', v)} /></div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <Label>Auto-open Debug tab on preview errors</Label>
                      <p className="text-xs text-muted-foreground mt-1">When the preview throws, switch the right panel to Debug.</p>
                    </div>
                    <Switch checked={settings.autoOpenDebugOnError} onCheckedChange={(v) => updateSetting('autoOpenDebugOnError', v)} />
                  </div>
                </div>
              </section>

              <Separator />

              <section>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Smartphone className="h-5 w-5" /> Remote Access</h2>
                <Card>
                  <CardContent className="p-6 space-y-3">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2"><Wifi className="w-4 h-4 text-green-500" /> LAN URL</Label>
                      <div className="flex items-center gap-2">
                        <Input value={lanUrl} readOnly className="font-mono text-sm" />
                        <Button variant="outline" size="icon" onClick={() => copy(lanUrl)}><Copy className="h-4 w-4" /></Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Local IP: <code className="bg-muted px-1 py-0.5 rounded">{localIP}</code> · Port {devPort}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2"><Globe className="w-4 h-4 text-blue-500" /> External tunnel</Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted px-3 py-1.5 rounded font-mono text-xs">npx localtunnel --port {devPort}</code>
                        <Button variant="outline" size="sm" onClick={() => copy(`npx localtunnel --port ${devPort}`)}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
                        <p className="text-sm text-amber-400">⚠️ Custom system prompts override default behavior.</p>
                        <div className="flex items-center justify-between"><Label>Enable Override</Label><Switch checked={settings.jailbreakEnabled} onCheckedChange={(v) => updateSetting('jailbreakEnabled', v)} /></div>
                        {settings.jailbreakEnabled && <Textarea value={settings.jailbreakPrompt} onChange={(e) => updateSetting('jailbreakPrompt', e.target.value)} placeholder="Enter custom system prompt..." rows={6} />}
                      </CardContent>
                    </Card>
                  </section>
                </>
              )}
            </TabsContent>

            {/* MODELS — single source of truth */}
            <TabsContent value="models">
              <ModelManager />
            </TabsContent>

            {/* ROUTING */}
            <TabsContent value="routing">
              <ModelRoutingPanel />
            </TabsContent>

            {/* VOICE — embed SettingsDialog opened on the voice tab so users get TTS + voice models */}
            <TabsContent value="voice">
              <SettingsDialog inline settings={chatSettings} onSave={handleChatSettingsSave} initialTab="voice" />
            </TabsContent>

            {/* UPDATES */}
            <TabsContent value="updates">
              <UpdatesPanel />
            </TabsContent>

            {/* DIAGNOSTICS */}
            <TabsContent value="diagnostics">
              <DiagnosticsPanel />
            </TabsContent>

            {/* ADVANCED — full SettingsDialog (API keys, prompt, plugins, account, hardware, debug) */}
            <TabsContent value="advanced">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Advanced</CardTitle>
                  <CardDescription>API keys, prompts, plugins, hardware, account, debug.</CardDescription>
                </CardHeader>
                <CardContent>
                  <SettingsDialog inline settings={chatSettings} onSave={handleChatSettingsSave} initialTab={initialChatTab || 'apikeys'} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
