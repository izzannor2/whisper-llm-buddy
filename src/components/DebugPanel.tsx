import { useState, useEffect, useCallback } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  Cpu, 
  Wifi, 
  WifiOff,
  Mic,
  Volume2,
  Server,
  HardDrive,
  Zap,
  Copy,
  Download,
  Trash2,
  Wrench
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { loadSettings } from '@/lib/chat-api';
import { 
  isWhisperLoaded, 
  getSelectedWhisperModel, 
  getDownloadedModels,
  isWebGPUSupported,
  WHISPER_MODELS
} from '@/lib/local-stt';
import { getToolStats, ToolStats } from '@/lib/tool-learning';
import { getAuditLog, AuditEntry } from '@/lib/permissions';
import { 
  isWhisperLoaded, 
  getSelectedWhisperModel, 
  getDownloadedModels,
  isWebGPUSupported,
  WHISPER_MODELS
} from '@/lib/local-stt';

interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'checking' | 'warning';
  message: string;
  details?: string;
}

export function DebugPanel() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [systemInfo, setSystemInfo] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 100));
  }, []);

  const checkOllama = async (): Promise<ServiceStatus> => {
    const settings = loadSettings();
    const url = settings.ollamaUrl || 'http://localhost:11434';
    try {
      addLog(`Checking Ollama at ${url}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${url}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        const modelCount = data.models?.length || 0;
        addLog(`✓ Ollama online with ${modelCount} model(s)`);
        return {
          name: 'Ollama',
          status: 'online',
          message: `${modelCount} model(s) available`,
          details: data.models?.map((m: any) => m.name).join(', ') || 'No models'
        };
      }
      addLog(`✗ Ollama returned ${response.status}`);
      return { name: 'Ollama', status: 'offline', message: `HTTP ${response.status}` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      addLog(`✗ Ollama error: ${msg}`);
      return { name: 'Ollama', status: 'offline', message: msg };
    }
  };

  const checkLlamaCpp = async (): Promise<ServiceStatus> => {
    const settings = loadSettings();
    const url = settings.localUrl || 'http://localhost:8080';
    try {
      addLog(`Checking Llama.cpp at ${url}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${url}/v1/models`, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        const modelCount = data.data?.length || 0;
        addLog(`✓ Llama.cpp online with ${modelCount} model(s)`);
        return {
          name: 'Llama.cpp Server',
          status: 'online',
          message: `${modelCount} model(s) loaded`,
          details: data.data?.map((m: any) => m.id).join(', ') || 'No models'
        };
      }
      addLog(`✗ Llama.cpp returned ${response.status}`);
      return { name: 'Llama.cpp Server', status: 'offline', message: `HTTP ${response.status}` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      addLog(`✗ Llama.cpp error: ${msg}`);
      return { name: 'Llama.cpp Server', status: 'offline', message: msg };
    }
  };

  const checkWhisper = async (): Promise<ServiceStatus> => {
    addLog('Checking Whisper status...');
    const downloaded = getDownloadedModels();
    const selected = getSelectedWhisperModel();
    const loaded = isWhisperLoaded();
    const modelInfo = WHISPER_MODELS.find(m => m.id === selected);
    
    if (downloaded.length === 0) {
      addLog('✗ No Whisper models downloaded');
      return {
        name: 'Whisper STT',
        status: 'offline',
        message: 'No models downloaded',
        details: 'Go to Voice tab to download a model'
      };
    }
    
    addLog(`✓ Whisper: ${downloaded.length} model(s), loaded: ${loaded}`);
    return {
      name: 'Whisper STT',
      status: loaded ? 'online' : 'warning',
      message: loaded ? 'Model loaded and ready' : 'Model downloaded but not loaded',
      details: `Selected: ${modelInfo?.name || selected} (${downloaded.length} cached)`
    };
  };

  const checkTTS = async (): Promise<ServiceStatus> => {
    addLog('Checking TTS status...');
    if (!('speechSynthesis' in window)) {
      addLog('✗ Speech synthesis not supported');
      return {
        name: 'Text-to-Speech',
        status: 'offline',
        message: 'Not supported in this browser'
      };
    }
    
    const voices = speechSynthesis.getVoices();
    addLog(`✓ TTS available with ${voices.length} voice(s)`);
    return {
      name: 'Text-to-Speech',
      status: 'online',
      message: `${voices.length} voices available`,
      details: voices.slice(0, 5).map(v => v.name).join(', ') + (voices.length > 5 ? '...' : '')
    };
  };

  const checkNetwork = async (): Promise<ServiceStatus> => {
    addLog('Checking network connectivity...');
    const online = navigator.onLine;
    
    if (!online) {
      addLog('✗ Browser reports offline');
      return {
        name: 'Network',
        status: 'offline',
        message: 'Browser reports offline'
      };
    }
    
    // Try to reach a known endpoint
    try {
      const response = await fetch('https://api.github.com', { method: 'HEAD', mode: 'no-cors' });
      addLog('✓ Network connectivity confirmed');
      return {
        name: 'Network',
        status: 'online',
        message: 'Internet connected'
      };
    } catch {
      addLog('⚠ Online but external requests may be blocked');
      return {
        name: 'Network',
        status: 'warning',
        message: 'Online but external requests may fail'
      };
    }
  };

  const checkWebGPU = async (): Promise<ServiceStatus> => {
    addLog('Checking WebGPU support...');
    const supported = await isWebGPUSupported();
    
    if (supported) {
      addLog('✓ WebGPU supported');
      return {
        name: 'WebGPU',
        status: 'online',
        message: 'Supported - faster inference available'
      };
    }
    
    addLog('⚠ WebGPU not available, using WASM fallback');
    return {
      name: 'WebGPU',
      status: 'warning',
      message: 'Not available - using WASM fallback',
      details: 'Whisper will run slower without GPU acceleration'
    };
  };

  const gatherSystemInfo = useCallback(() => {
    const settings = loadSettings();
    const info: Record<string, string> = {
      'User Agent': navigator.userAgent,
      'Platform': navigator.platform,
      'Language': navigator.language,
      'Online': navigator.onLine ? 'Yes' : 'No',
      'Cookies Enabled': navigator.cookieEnabled ? 'Yes' : 'No',
      'Memory': (navigator as any).deviceMemory ? `${(navigator as any).deviceMemory} GB` : 'Unknown',
      'CPU Cores': navigator.hardwareConcurrency?.toString() || 'Unknown',
      'Screen': `${screen.width}x${screen.height}`,
      'Window': `${window.innerWidth}x${window.innerHeight}`,
      'Backend': settings.backend || 'Not set',
      'Ollama URL': settings.ollamaUrl || 'http://localhost:11434',
      'Llama.cpp URL': settings.localUrl || 'http://localhost:8080',
      'Selected Ollama Model': settings.ollamaModel || 'None',
      'Whisper Model': getSelectedWhisperModel(),
      'Downloaded Whisper Models': getDownloadedModels().length.toString(),
    };
    setSystemInfo(info);
  }, []);

  const runAllChecks = useCallback(async () => {
    setIsChecking(true);
    setServices([]);
    addLog('--- Starting diagnostics ---');
    
    const checks = [
      checkNetwork(),
      checkOllama(),
      checkLlamaCpp(),
      checkWhisper(),
      checkTTS(),
      checkWebGPU(),
    ];
    
    const results = await Promise.all(checks);
    setServices(results);
    gatherSystemInfo();
    
    addLog('--- Diagnostics complete ---');
    setIsChecking(false);
  }, [addLog, gatherSystemInfo]);

  useEffect(() => {
    runAllChecks();
  }, [runAllChecks]);

  const copyDiagnostics = () => {
    const report = [
      '=== LocalDev AI Diagnostics Report ===',
      `Generated: ${new Date().toISOString()}`,
      '',
      '--- Services ---',
      ...services.map(s => `${s.name}: ${s.status.toUpperCase()} - ${s.message}${s.details ? ` (${s.details})` : ''}`),
      '',
      '--- System Info ---',
      ...Object.entries(systemInfo).map(([k, v]) => `${k}: ${v}`),
      '',
      '--- Recent Logs ---',
      ...logs.slice(0, 20),
    ].join('\n');
    
    navigator.clipboard.writeText(report);
    toast.success('Diagnostics copied to clipboard');
  };

  const downloadDiagnostics = () => {
    const report = [
      '=== LocalDev AI Diagnostics Report ===',
      `Generated: ${new Date().toISOString()}`,
      '',
      '--- Services ---',
      ...services.map(s => `${s.name}: ${s.status.toUpperCase()} - ${s.message}${s.details ? ` (${s.details})` : ''}`),
      '',
      '--- System Info ---',
      ...Object.entries(systemInfo).map(([k, v]) => `${k}: ${v}`),
      '',
      '--- All Logs ---',
      ...logs,
    ].join('\n');
    
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `localdev-diagnostics-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Diagnostics downloaded');
  };

  const getStatusIcon = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'online': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'offline': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'checking': return <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />;
    }
  };

  const getServiceIcon = (name: string) => {
    if (name.includes('Ollama') || name.includes('Llama')) return <Server className="w-4 h-4" />;
    if (name.includes('Whisper')) return <Mic className="w-4 h-4" />;
    if (name.includes('TTS')) return <Volume2 className="w-4 h-4" />;
    if (name.includes('Network')) return <Wifi className="w-4 h-4" />;
    if (name.includes('WebGPU')) return <Zap className="w-4 h-4" />;
    return <HardDrive className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">System Diagnostics</h3>
          <p className="text-sm text-muted-foreground">Check the status of all services and connections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyDiagnostics}>
            <Copy className="w-4 h-4 mr-2" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={downloadDiagnostics}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button size="sm" onClick={runAllChecks} disabled={isChecking}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid gap-3">
        {services.map((service) => (
          <div 
            key={service.name}
            className="flex items-center gap-3 p-3 rounded-lg border bg-card"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
              {getServiceIcon(service.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{service.name}</span>
                {getStatusIcon(service.status)}
              </div>
              <p className="text-sm text-muted-foreground truncate">{service.message}</p>
              {service.details && (
                <p className="text-xs text-muted-foreground/70 truncate">{service.details}</p>
              )}
            </div>
            <Badge 
              variant={service.status === 'online' ? 'default' : service.status === 'warning' ? 'secondary' : 'destructive'}
              className="capitalize"
            >
              {service.status}
            </Badge>
          </div>
        ))}
      </div>

      <Separator />

      {/* System Info */}
      <div>
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          System Information
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(systemInfo).map(([key, value]) => (
            <div key={key} className="flex justify-between p-2 rounded bg-muted/50">
              <span className="text-muted-foreground">{key}:</span>
              <span className="font-mono text-xs truncate max-w-[180px]" title={value}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Logs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium">Diagnostic Logs</h4>
          <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
            <Trash2 className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
        <ScrollArea className="h-48 rounded-lg border bg-muted/30 p-3">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No logs yet</p>
          ) : (
            <div className="space-y-1 font-mono text-xs">
              {logs.map((log, i) => (
                <div key={i} className={`${log.includes('✓') ? 'text-accent' : log.includes('✗') ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Troubleshooting Tips */}
      <div className="p-4 rounded-lg border border-accent/30 bg-accent/5">
        <h4 className="font-medium mb-2 text-accent">Troubleshooting Tips</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• <strong>Ollama offline?</strong> Run <code className="px-1 bg-muted rounded">ollama serve</code> or use <code>start.bat</code></li>
          <li>• <strong>No Whisper model?</strong> Go to Voice tab and download a model</li>
          <li>• <strong>WebGPU not available?</strong> Update your browser or use Chrome/Edge</li>
          <li>• <strong>Network issues?</strong> Check firewall settings for localhost access</li>
        </ul>
      </div>
    </div>
  );
}
