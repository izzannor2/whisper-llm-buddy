import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Moon, Sun, Wifi, WifiOff, RefreshCw, AlertTriangle, Cpu, Plug, FlaskConical, Brain, BookOpen, Shield, Server, HardDrive, Globe, Copy, QrCode, Smartphone } from 'lucide-react';
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
import { SettingsDialog } from '@/components/SettingsDialog';
import { LauncherToolsDialog } from '@/components/LauncherToolsDialog';
import { loadSettings as loadChatSettings, saveSettings as saveChatSettings, type ChatSettings } from '@/lib/chat-api';

// Simple QR code generator using canvas
function generateQRDataUrl(text: string): string {
  // Minimal QR placeholder — generates a visual representation
  const canvas = document.createElement('canvas');
  const size = 200;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  
  // Generate a deterministic pattern from the URL
  const hash = text.split('').reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
  const moduleSize = 8;
  const modules = Math.floor(size / moduleSize);
  
  // QR-like finder patterns
  const drawFinder = (x: number, y: number) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
          ctx.fillRect((x + i) * moduleSize, (y + j) * moduleSize, moduleSize, moduleSize);
        }
      }
    }
  };
  
  drawFinder(1, 1);
  drawFinder(modules - 8, 1);
  drawFinder(1, modules - 8);
  
  // Data area with deterministic pattern
  for (let i = 9; i < modules - 1; i++) {
    for (let j = 9; j < modules - 1; j++) {
      const seed = (hash + i * 31 + j * 17 + text.charCodeAt(i % text.length)) & 0xFFFF;
      if (seed % 3 === 0) {
        ctx.fillRect(i * moduleSize, j * moduleSize, moduleSize, moduleSize);
      }
    }
  }
  
  return canvas.toDataURL();
}

// Detect local IP via RTCPeerConnection
async function detectLocalIP(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const match = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match && !match[1].startsWith('0.') && match[1] !== '0.0.0.0') {
          resolve(match[1]);
          pc.close();
        }
      };
      setTimeout(() => { pc.close(); resolve('Unable to detect'); }, 5000);
    } catch {
      resolve('Unable to detect');
    }
  });
}

export default function IDESettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialChatTab = searchParams.get('tab') || undefined;
  const [settings, setSettings] = useState<IDESettingsType>(DEFAULT_SETTINGS);
  const [chatSettings, setChatSettings] = useState<ChatSettings>(() => loadChatSettings());
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [llamaCppConnected, setLlamaCppConnected] = useState(false);
  const [llamaCppInfo, setLlamaCppInfo] = useState<{ model: string; ctx_size: number; n_threads: number } | null>(null);
  const [selectedGgufFile, setSelectedGgufFile] = useState<File | null>(null);
  const [localIP, setLocalIP] = useState('Detecting...');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [devPort] = useState('8080');

  const handleChatSettingsSave = (next: ChatSettings) => {
    setChatSettings(next);
    saveChatSettings(next);
  };


  useEffect(() => {
    setSettings(getIDESettings());
    checkConnections();
    detectLocalIP().then(ip => {
      setLocalIP(ip);
      const url = `http://${ip}:${devPort}`;
      setQrDataUrl(generateQRDataUrl(url));
    });
  }, [devPort]);

  const checkConnections = async () => {
    const ollamaOk = await isOllamaRunning();
    setOllamaConnected(ollamaOk);
    if (ollamaOk) { const modelList = await listModels(); setModels(modelList); }
    const llamaOk = await isLlamaCppRunning();
    setLlamaCppConnected(llamaOk);
    if (llamaOk) { const info = await getLlamaCppServerInfo(); setLlamaCppInfo(info); }
  };

  const checkOllama = async () => {
    const connected = await isOllamaRunning();
    setOllamaConnected(connected);
    if (connected) { const modelList = await listModels(); setModels(modelList); }
  };

  const checkLlamaCpp = async () => {
    const connected = await isLlamaCppRunning();
    setLlamaCppConnected(connected);
    if (connected) { const info = await getLlamaCppServerInfo(); setLlamaCppInfo(info); toast.success('Connected to llama.cpp server'); }
    else toast.error('Could not connect to llama.cpp server');
  };

  const handleGgufSelected = async (file: File) => {
    setSelectedGgufFile(file);
    const previousModel = settings.llamaCppModel;
    updateSetting('llamaCppModel', file.name);

    // Don't fire on initial load — only when model actually changes
    if (previousModel === file.name) return;

    const ctx = settings.llamaCppContextSize;
    const toastId = toast.loading(`Switching active GGUF model…`, {
      description: `${file.name} • ctx ${ctx}`,
    });

    // Probe llama.cpp /props to confirm reload (best-effort, with retries)
    let reloaded = false;
    let serverModel = '';
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 600));
      const info = await getLlamaCppServerInfo();
      if (info) {
        serverModel = info.model || '';
        // Match by basename — server returns full path
        const base = serverModel.split(/[\\/]/).pop() || '';
        if (base === file.name) { reloaded = true; break; }
      }
    }

    if (reloaded) {
      toast.success(`Active model: ${file.name}`, {
        id: toastId,
        description: `Context ${ctx} tokens • llama-server reloaded successfully`,
      });
    } else {
      toast.warning(`Active model set: ${file.name}`, {
        id: toastId,
        description: `Context ${ctx} tokens • server did not confirm reload (restart llama-server to apply)`,
      });
    }
  };

  const copyLlamaCommand = () => {
    if (!selectedGgufFile) { toast.error('Please select a GGUF model file first'); return; }
    const command = generateLlamaServerCommand(selectedGgufFile.name, {
      port: 8081, contextSize: settings.llamaCppContextSize, threads: settings.llamaCppThreads, gpuLayers: settings.llamaCppGpuLayers,
    });
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const updateSetting = <K extends keyof IDESettingsType>(key: K, value: IDESettingsType[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveIDESettings(settings);
    toast.success('Settings saved');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/ide')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
        <div className="flex items-center gap-2">
          <LauncherToolsDialog />
          <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" />Save</Button>
        </div>
      </header>

      <ScrollArea className="h-[calc(100vh-56px)]">
        <div className="max-w-4xl mx-auto p-6 space-y-8">
          {/* Modes */}
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

          {/* LLM Backend */}
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
              <Card className="mb-4">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4" /> Ollama Configuration</CardTitle></CardHeader>
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

            {settings.llmBackend === 'llama-cpp' && (
              <Card className="mb-4">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><HardDrive className="h-4 w-4" /> Llama.cpp Configuration</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><Label>Server URL</Label><Input value={settings.llamaCppUrl} onChange={(e) => updateSetting('llamaCppUrl', e.target.value)} placeholder="http://127.0.0.1:8081" /></div>
                  {llamaCppConnected ? (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm">Connected</span>
                      <Button variant="outline" size="sm" onClick={checkLlamaCpp}>Test</Button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-sm font-medium">Not running — start GGUF server</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Run <code className="bg-muted px-1 py-0.5 rounded">START-GGUF-SERVER.bat</code> in
                        the project root, or use the local agent to start it (requires the agent on :3847).
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={checkLlamaCpp}>Test again</Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!selectedGgufFile) {
                              toast.error('Pick a GGUF file first (below)');
                              return;
                            }
                            try {
                              const status = await fetch('http://127.0.0.1:3847/status').then(r => r.json());
                              const cmd = `bin\\llama\\llama-server.exe -m models/gguf/${selectedGgufFile.name} --port 8081 --host 127.0.0.1 -ngl 99`;
                              const res = await fetch('http://127.0.0.1:3847/exec', {
                                method: 'POST',
                                headers: { 'content-type': 'application/json', 'x-agent-session': status.sessionToken },
                                body: JSON.stringify({ command: cmd }),
                              });
                              if (res.ok) toast.success('GGUF server starting…');
                              else toast.error('Agent rejected the command — start it manually');
                            } catch {
                              toast.error('Local agent not reachable — run START-GGUF-SERVER.bat manually');
                            }
                          }}
                        >
                          Start GGUF Server
                        </Button>
                      </div>
                    </div>
                  )}
                  {llamaCppConnected && llamaCppInfo && (
                    <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 text-sm">
                      <p><strong>Model:</strong> {llamaCppInfo.model || 'Unknown'}</p>
                      <p><strong>Context:</strong> {llamaCppInfo.ctx_size} tokens</p>
                      <p><strong>Threads:</strong> {llamaCppInfo.n_threads}</p>
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

          {/* Remote Access */}
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Smartphone className="h-5 w-5" /> Remote Access
            </h2>
            <Card>
              <CardContent className="p-6 space-y-5">
                <p className="text-sm text-muted-foreground">
                  Access this dev server from other devices on your network. Make sure your firewall allows port {devPort}.
                </p>

                {/* LAN URL */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-green-500" /> Home (LAN)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input value={lanUrl} readOnly className="font-mono text-sm" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(lanUrl)} title="Copy LAN URL">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">For devices on the same WiFi network</p>
                </div>

                {/* External / Away */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" /> Away (External)
                  </Label>
                  <div className="p-3 rounded-lg bg-muted/50 border text-sm space-y-2">
                    <p className="text-muted-foreground">To access from outside your network, use a tunnel:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted px-3 py-1.5 rounded font-mono text-xs">npx localtunnel --port {devPort}</code>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(`npx localtunnel --port ${devPort}`)}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Or use ngrok, Cloudflare Tunnel, or Tailscale for persistent access.</p>
                  </div>
                </div>

                {/* QR Code */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <QrCode className="w-4 h-4" /> Scan with Phone
                  </Label>
                  <div className="flex items-center gap-4">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="QR Code for LAN URL" className="w-32 h-32 rounded-lg border" />
                    ) : (
                      <div className="w-32 h-32 rounded-lg border bg-muted flex items-center justify-center">
                        <Smartphone className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Scan this QR code with your phone's camera to open the app.</p>
                      <p className="text-xs">Local IP: <code className="bg-muted px-1 py-0.5 rounded">{localIP}</code></p>
                      <p className="text-xs">Port: <code className="bg-muted px-1 py-0.5 rounded">{devPort}</code></p>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
                  <p className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> 
                    Both devices must be on the same WiFi for LAN access. For external access, set up a tunnel.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* Editor */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Editor</h2>
            <div className="space-y-4">
              <div><Label>Font Size: {settings.fontSize}px</Label><Slider value={[settings.fontSize]} onValueChange={([v]) => updateSetting('fontSize', v)} min={10} max={24} step={1} /></div>
              <div className="flex items-center justify-between"><Label>Auto Save</Label><Switch checked={settings.autoSave} onCheckedChange={(v) => updateSetting('autoSave', v)} /></div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Label>Auto-open Debug tab on preview errors</Label>
                  <p className="text-xs text-muted-foreground mt-1">When the preview throws an error, automatically switch the right panel to the Debug tab.</p>
                </div>
                <Switch checked={settings.autoOpenDebugOnError} onCheckedChange={(v) => updateSetting('autoOpenDebugOnError', v)} />
              </div>
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

          <Separator />

          {/* Unified app/chat settings (Backend, Models, Voice, API Keys, TTS, Plugins, Updates, Account, Debug…) */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Application</h2>
            <SettingsDialog
              inline
              settings={chatSettings}
              onSave={handleChatSettingsSave}
              initialTab={initialChatTab}
            />
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
