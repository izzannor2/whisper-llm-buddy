import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Star, Play, Square, Trash2, Wifi, Globe, Cpu,
  Monitor, Download, ExternalLink, RefreshCw, Loader2, Search, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAgentStatus } from '@/hooks/use-agent-status';

interface LocalModel {
  id: string;
  name: string;
  filename: string;
  size: string;
  installedAt?: string;
  isLoaded?: boolean;
  hasVision?: boolean;
  source: 'ollama' | 'llama-cpp' | 'local';
}

interface HFModel {
  id: string;
  modelId: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  lastModified: string;
}

// Calculate AI capability score
function calculateAIScore(): { score: number; rating: string; maxModels: string } {
  const memory = (navigator as any).deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 4;
  let score = Math.min(99, Math.round((memory * 5) + (cores * 3)));
  let rating = 'Limited';
  let maxModels = '3B models';
  if (score >= 90) { rating = 'Excellent'; maxModels = '14B+ models'; }
  else if (score >= 70) { rating = 'Good'; maxModels = '7B models'; }
  else if (score >= 50) { rating = 'Moderate'; maxModels = '3B models'; }
  return { score, rating, maxModels };
}

export default function Models() {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [hfModels, setHfModels] = useState<HFModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<LocalModel | null>(null);
  const [loadedModel, setLoadedModel] = useState<LocalModel | null>(null);
  const [showMachineSpecs, setShowMachineSpecs] = useState(false);
  const [activeTab, setActiveTab] = useState('my-models');
  const [isScanning, setIsScanning] = useState(false);
  const [isSearchingHF, setIsSearchingHF] = useState(false);
  const [hfSearch, setHfSearch] = useState('');
  const [ollamaPullName, setOllamaPullName] = useState('');
  const [isPulling, setIsPulling] = useState(false);

  const aiScore = calculateAIScore();

  // Scan local models on mount
  useEffect(() => { scanLocalModels(); }, []);

  const scanLocalModels = useCallback(async () => {
    setIsScanning(true);
    const found: LocalModel[] = [];

    // Scan Ollama
    try {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        for (const m of (data.models || [])) {
          found.push({
            id: `ollama-${m.name}`,
            name: m.name,
            filename: m.name,
            size: m.size ? `${(m.size / 1e9).toFixed(1)} GB` : 'Unknown',
            source: 'ollama',
            installedAt: m.modified_at ? new Date(m.modified_at).toLocaleDateString() : undefined,
          });
        }
      }
    } catch { /* Ollama not running */ }

    // Scan llama.cpp
    try {
      const res = await fetch('http://127.0.0.1:8081/v1/models', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        for (const m of (data.data || [])) {
          if (!found.some(f => f.name === m.id)) {
            found.push({
              id: `llama-${m.id}`,
              name: m.id,
              filename: m.id,
              size: 'Active',
              source: 'llama-cpp',
              isLoaded: true,
            });
          }
        }
      }
    } catch { /* llama.cpp not running */ }

    setModels(found);
    if (found.length > 0 && !defaultModel) {
      setDefaultModel(found[0]);
      setLoadedModel(found.find(m => m.isLoaded) || null);
    }
    setIsScanning(false);
    if (found.length === 0) {
      toast.info('No local models found. Start Ollama or llama-server, or browse Hugging Face.');
    } else {
      toast.success(`Found ${found.length} model(s)`);
    }
  }, [defaultModel]);

  // Search Hugging Face
  const searchHuggingFace = useCallback(async (query?: string) => {
    setIsSearchingHF(true);
    try {
      const searchTerm = query || hfSearch || 'gguf';
      const res = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(searchTerm)}&filter=gguf&sort=downloads&direction=-1&limit=20`
      );
      if (!res.ok) throw new Error('HF API error');
      const data = await res.json();
      setHfModels(data.map((m: any) => ({
        id: m.id || m._id,
        modelId: m.modelId || m.id,
        author: m.author || m.id?.split('/')[0] || 'unknown',
        downloads: m.downloads || 0,
        likes: m.likes || 0,
        tags: m.tags || [],
        lastModified: m.lastModified || '',
      })));
    } catch (err) {
      toast.error('Failed to search Hugging Face');
    } finally {
      setIsSearchingHF(false);
    }
  }, [hfSearch]);

  // Pull model via Ollama
  const pullOllamaModel = useCallback(async () => {
    if (!ollamaPullName.trim()) return;
    setIsPulling(true);
    toast.info(`Pulling ${ollamaPullName}... This may take a while.`);
    try {
      const res = await fetch('http://localhost:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ollamaPullName.trim() }),
      });
      if (!res.ok) throw new Error('Pull failed');
      
      // Stream the pull progress
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.status) {
                toast.loading(parsed.status, { id: 'ollama-pull' });
              }
            } catch {}
          }
        }
      }
      
      toast.dismiss('ollama-pull');
      toast.success(`Successfully pulled ${ollamaPullName}`);
      setOllamaPullName('');
      await scanLocalModels();
    } catch {
      toast.dismiss('ollama-pull');
      toast.error('Failed to pull model. Is Ollama running?');
    } finally {
      setIsPulling(false);
    }
  }, [ollamaPullName, scanLocalModels]);

  const handleLoadModel = (model: LocalModel) => {
    if (loadedModel?.id === model.id) {
      setLoadedModel(null);
      setModels(prev => prev.map(m => ({ ...m, isLoaded: false })));
      toast.success(`Unloaded ${model.name}`);
    } else {
      setLoadedModel(model);
      setModels(prev => prev.map(m => ({ ...m, isLoaded: m.id === model.id })));
      toast.success(`Loaded ${model.name}`);
    }
  };

  const handleSetDefault = (model: LocalModel) => {
    setDefaultModel(model);
    toast.success(`Set ${model.name} as default`);
  };

  const handleDeleteModel = async (model: LocalModel) => {
    if (model.source === 'ollama') {
      try {
        await fetch('http://localhost:11434/api/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: model.name }),
        });
        toast.success(`Deleted ${model.name} from Ollama`);
      } catch {
        toast.error('Failed to delete model from Ollama');
        return;
      }
    }
    setModels(prev => prev.filter(m => m.id !== model.id));
    if (loadedModel?.id === model.id) setLoadedModel(null);
    if (defaultModel?.id === model.id) setDefaultModel(null);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar p-4 flex flex-col">
        <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Chat
        </Link>
        <div className="space-y-1">
          <Button variant="ghost" className="w-full justify-start" asChild>
            <Link to="/"><Star className="w-4 h-4 mr-3" />New Chat</Link>
          </Button>
          <Button variant="secondary" className="w-full justify-start">
            <Cpu className="w-4 h-4 mr-3" />Models
          </Button>
        </div>
        <div className="flex-1" />

        {/* Ollama Pull */}
        <div className="space-y-2 mt-4 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground font-mono">OLLAMA PULL</p>
          <div className="flex gap-1">
            <Input
              value={ollamaPullName}
              onChange={e => setOllamaPullName(e.target.value)}
              placeholder="model:tag"
              className="h-8 text-xs font-mono"
              onKeyDown={e => e.key === 'Enter' && pullOllamaModel()}
            />
            <Button size="sm" className="h-8 px-2" onClick={pullOllamaModel} disabled={isPulling || !ollamaPullName.trim()}>
              {isPulling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        <div className="space-y-1 mt-4">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground">
            <Monitor className="w-4 h-4 mr-3" />Quit LocalDev
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border flex items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold font-mono flex items-center gap-2">
              <Cpu className="w-5 h-5" />Models
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              {models.length} model(s) detected
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 px-3 font-mono" onClick={() => setShowMachineSpecs(true)}>
              <span className="w-2 h-2 rounded-full bg-accent mr-2" />{aiScore.score}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 font-mono"
              onClick={scanLocalModels}
              disabled={isScanning}
            >
              {isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Scan
            </Button>
            <Button
              size="sm"
              className="h-8 px-3 font-mono"
              onClick={() => { setActiveTab('huggingface'); searchHuggingFace('gguf'); }}
            >
              <Globe className="w-4 h-4 mr-2" />Explore Models
            </Button>
          </div>
        </header>

        <ScrollArea className="flex-1 p-6">
          {/* Runtime Status */}
          <div className="mb-6">
            <h3 className="text-xs text-muted-foreground font-mono mb-2">Runtime Status</h3>
            <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-muted-foreground" />
                <div>
                  {loadedModel ? (
                    <>
                      <p className="text-accent font-mono">Model Loaded</p>
                      <p className="text-sm text-muted-foreground font-mono">{loadedModel.name} ({loadedModel.source})</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground font-mono">No model loaded</p>
                  )}
                </div>
              </div>
              {loadedModel && (
                <Button variant="ghost" size="sm" onClick={() => handleLoadModel(loadedModel)}>Unload</Button>
              )}
            </div>
          </div>

          {/* Default Model */}
          <div className="mb-6">
            <h3 className="text-xs text-muted-foreground font-mono mb-2">DEFAULT MODEL</h3>
            {defaultModel ? (
              <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="font-mono">{defaultModel.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{defaultModel.source}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDefaultModel(null)}>Clear</Button>
              </div>
            ) : (
              <div className="p-4 bg-card border border-border rounded-lg text-muted-foreground font-mono text-sm">
                No default model — scan for local models or pull one via Ollama
              </div>
            )}
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-muted/50 mb-4">
              <TabsTrigger value="my-models" className="font-mono text-sm">
                <Star className="w-4 h-4 mr-2" />Local
                <Badge variant="secondary" className="ml-2 text-xs">{models.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="huggingface" className="font-mono text-sm">
                <Globe className="w-4 h-4 mr-2" />Hugging Face
              </TabsTrigger>
            </TabsList>

            <TabsContent value="my-models" className="space-y-3">
              {models.length === 0 && !isScanning && (
                <div className="text-center py-8 text-muted-foreground">
                  <Cpu className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No local models detected</p>
                  <p className="text-xs mt-1">Start Ollama or llama-server, then click Scan</p>
                </div>
              )}
              {isScanning && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />Scanning local backends...
                </div>
              )}
              {models.map((model) => (
                <div key={model.id} className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono">{model.name}</p>
                      <Badge variant="outline" className="text-xs">{model.source}</Badge>
                      {model.isLoaded && <Badge className="bg-accent/20 text-accent text-xs">✓ Loaded</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{model.size}</p>
                    {model.installedAt && <p className="text-xs text-muted-foreground font-mono">Added {model.installedAt}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleSetDefault(model)}>
                      <Star className="w-4 h-4 mr-1" />Default
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleLoadModel(model)}>
                      {model.isLoaded ? <><Square className="w-4 h-4 mr-1" />Unload</> : <><Play className="w-4 h-4 mr-1" />Load</>}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteModel(model)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="huggingface" className="space-y-3">
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={hfSearch}
                    onChange={e => setHfSearch(e.target.value)}
                    placeholder="Search GGUF models..."
                    className="pl-9 font-mono"
                    onKeyDown={e => e.key === 'Enter' && searchHuggingFace()}
                  />
                </div>
                <Button onClick={() => searchHuggingFace()} disabled={isSearchingHF}>
                  {isSearchingHF ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Search
                </Button>
              </div>
              
              {hfModels.length === 0 && !isSearchingHF && (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Search Hugging Face for GGUF models</p>
                  <p className="text-xs mt-1">Find and download models to run locally</p>
                </div>
              )}

              {hfModels.map((model) => (
                <div key={model.id} className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
                  <div>
                    <p className="font-mono text-sm">{model.modelId}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mt-1">
                      <span>👤 {model.author}</span>
                      <span>⬇ {model.downloads.toLocaleString()}</span>
                      <span>❤ {model.likes}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`https://huggingface.co/${model.modelId}`, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />View
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        // Try to pull via Ollama using the HF model name
                        setOllamaPullName(model.modelId);
                        toast.info(`Set "${model.modelId}" for Ollama pull. Use the sidebar pull to download.`);
                      }}
                    >
                      <Download className="w-4 h-4 mr-1" />Pull
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </div>

      {/* Machine Specs Modal */}
      <Dialog open={showMachineSpecs} onOpenChange={setShowMachineSpecs}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">
              <Monitor className="w-5 h-5" />Machine Specs
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-mono">AI Capability Score</p>
                  <p className="text-sm text-muted-foreground">Can handle {aiScore.maxModels}</p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold font-mono">{aiScore.score}</p>
                  <Badge className="bg-accent text-accent-foreground">{aiScore.rating}</Badge>
                </div>
              </div>
              <Progress value={aiScore.score} className="h-2 bg-muted-foreground/20" />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setShowMachineSpecs(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
