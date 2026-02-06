import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Star,
  Play,
  Square,
  Trash2,
  Wifi,
  Globe,
  Cpu,
  Monitor,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Mock model data
interface LocalModel {
  id: string;
  name: string;
  filename: string;
  size: string;
  installedAt?: string;
  isLoaded?: boolean;
  hasVision?: boolean;
}

const MOCK_MODELS: LocalModel[] = [
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    size: '770.3 MB',
    installedAt: '12/25/2025',
    isLoaded: true,
  },
  {
    id: 'qwen-2.5-7b',
    name: 'Qwen2.5 7B Unfiltered',
    filename: 'Qwen2.5-7B-Instruct-abliterated-v2.Q4_K_M.gguf',
    size: '4.4 GB',
    installedAt: '12/25/2025',
  },
  {
    id: 'qwen-2.5-7b-vision',
    name: 'Qwen2.5 7B Image Capable',
    filename: 'Qwen2.5-VL-7B-Instruct-q4_k_m.gguf',
    size: '4.5 GB',
    installedAt: '12/25/2025',
    hasVision: true,
  },
];

const OPENROUTER_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic' },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'Google' },
  { id: 'llama-3-70b', name: 'Llama 3 70B', provider: 'Meta' },
  { id: 'mixtral-8x7b', name: 'Mixtral 8x7B', provider: 'Mistral' },
];

// Calculate AI capability score based on device
function calculateAIScore(): { score: number; rating: string; maxModels: string } {
  // Simulated - in reality would check GPU, RAM, etc.
  const memory = (navigator as any).deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 4;
  
  // Score based on available resources
  let score = Math.min(99, Math.round((memory * 5) + (cores * 3)));
  
  let rating = 'Limited';
  let maxModels = '3B models';
  
  if (score >= 90) {
    rating = 'Excellent';
    maxModels = '14B+ models';
  } else if (score >= 70) {
    rating = 'Good';
    maxModels = '7B models';
  } else if (score >= 50) {
    rating = 'Moderate';
    maxModels = '3B models';
  }
  
  return { score, rating, maxModels };
}

export default function Models() {
  const [models, setModels] = useState<LocalModel[]>(MOCK_MODELS);
  const [defaultModel, setDefaultModel] = useState<LocalModel | null>(MOCK_MODELS[0]);
  const [loadedModel, setLoadedModel] = useState<LocalModel | null>(MOCK_MODELS[0]);
  const [showMachineSpecs, setShowMachineSpecs] = useState(false);
  const [activeTab, setActiveTab] = useState('my-models');
  
  const aiScore = calculateAIScore();

  const handleLoadModel = (model: LocalModel) => {
    if (loadedModel?.id === model.id) {
      // Unload
      setLoadedModel(null);
      setModels(prev => prev.map(m => ({ ...m, isLoaded: false })));
      toast.success(`Unloaded ${model.name}`);
    } else {
      // Load
      setLoadedModel(model);
      setModels(prev => prev.map(m => ({ 
        ...m, 
        isLoaded: m.id === model.id 
      })));
      toast.success(`Loaded ${model.name}`);
    }
  };

  const handleSetDefault = (model: LocalModel) => {
    setDefaultModel(model);
    toast.success(`Set ${model.name} as default`);
  };

  const handleDeleteModel = (model: LocalModel) => {
    setModels(prev => prev.filter(m => m.id !== model.id));
    if (loadedModel?.id === model.id) setLoadedModel(null);
    if (defaultModel?.id === model.id) setDefaultModel(null);
    toast.success(`Deleted ${model.name}`);
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
            <Link to="/">
              <Star className="w-4 h-4 mr-3" />
              New Chat
            </Link>
          </Button>
          <Button variant="secondary" className="w-full justify-start">
            <Cpu className="w-4 h-4 mr-3" />
            Models
          </Button>
        </div>

        <div className="flex-1" />

        <div className="space-y-1">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground">
            <Monitor className="w-4 h-4 mr-3" />
            Quit LocalDev
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold font-mono flex items-center gap-2">
              <Cpu className="w-5 h-5" />
              Models
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              Connected to /Volumes/LocalDev
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* AI Score Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 font-mono"
              onClick={() => setShowMachineSpecs(true)}
            >
              <span className="w-2 h-2 rounded-full bg-accent mr-2" />
              {aiScore.score}
            </Button>

            <Button variant="outline" size="sm" className="h-8 px-3 font-mono">
              <Wifi className="w-4 h-4 mr-2" />
              API
            </Button>

            <Button size="sm" className="h-8 px-3 font-mono">
              <Globe className="w-4 h-4 mr-2" />
              Explore Models
            </Button>
          </div>
        </header>

        {/* Content */}
        <ScrollArea className="flex-1 p-6">
          {/* Runtime Status */}
          <div className="mb-6">
            <h3 className="text-xs text-muted-foreground font-mono mb-2">Runtime Status ?</h3>
            <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-muted-foreground" />
                <div>
                  {loadedModel ? (
                    <>
                      <p className="text-accent font-mono">Model Loaded</p>
                      <p className="text-sm text-muted-foreground font-mono">{loadedModel.name}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground font-mono">No model loaded</p>
                  )}
                </div>
              </div>
              {loadedModel && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleLoadModel(loadedModel)}
                >
                  Unload
                </Button>
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
                    <p className="text-sm text-muted-foreground font-mono">Local Model</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setDefaultModel(null)}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <div className="p-4 bg-card border border-border rounded-lg text-muted-foreground font-mono text-sm">
                No default model selected
              </div>
            )}
            <p className="text-xs text-muted-foreground font-mono mt-2">
              The default model is automatically selected when starting new chats.
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-muted/50 mb-4">
              <TabsTrigger value="my-models" className="font-mono text-sm">
                <Star className="w-4 h-4 mr-2" />
                My LocalDev
                <Badge variant="secondary" className="ml-2 text-xs">{models.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="local-models" className="font-mono text-sm">
                <Monitor className="w-4 h-4 mr-2" />
                Local Models
                <Badge variant="secondary" className="ml-2 text-xs">7</Badge>
              </TabsTrigger>
              <TabsTrigger value="openrouter" className="font-mono text-sm">
                <Wifi className="w-4 h-4 mr-2" />
                OpenRouter
                <Badge variant="secondary" className="ml-2 text-xs">{OPENROUTER_MODELS.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="my-models" className="space-y-3">
              {models.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-lg"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono">{model.name}</p>
                      {model.isLoaded && (
                        <Badge className="bg-accent/20 text-accent text-xs">
                          ✓ Loaded
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{model.filename}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {model.size} • Installed {model.installedAt}
                      {model.hasVision && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          📷 Vision
                        </Badge>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadModel(model)}
                    >
                      {model.isLoaded ? (
                        <>
                          <Square className="w-4 h-4 mr-1" />
                          Unload
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Load
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteModel(model)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="local-models" className="space-y-3">
              <p className="text-sm text-muted-foreground font-mono">
                Models available on your local llama.cpp or Ollama server.
              </p>
              <Button variant="outline" className="font-mono">
                <Download className="w-4 h-4 mr-2" />
                Scan Local Models
              </Button>
            </TabsContent>

            <TabsContent value="openrouter" className="space-y-3">
              {OPENROUTER_MODELS.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-lg"
                >
                  <div>
                    <p className="font-mono">{model.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{model.provider}</p>
                  </div>
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Use
                  </Button>
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
              <Monitor className="w-5 h-5" />
              Machine Specs
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* AI Score Card */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-mono">AI Capability Score</p>
                  <p className="text-sm text-muted-foreground">
                    Can handle very large models
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold font-mono">{aiScore.score}</p>
                  <Badge className="bg-accent text-accent-foreground">
                    {aiScore.rating}
                  </Badge>
                </div>
              </div>
              <Progress value={aiScore.score} className="h-2 bg-muted-foreground/20" />
              <div className="flex items-center gap-2 mt-3 text-xs font-mono">
                <span>Max recommended:</span>
                <Badge variant="secondary">{aiScore.maxModels}</Badge>
                <Badge variant="outline">Metal</Badge>
                <Badge variant="outline">Unified Memory</Badge>
              </div>
            </div>

            {/* Recommended Model Sizes */}
            <div>
              <h4 className="text-sm font-mono mb-3">Recommended Model Sizes</h4>
              <div className="space-y-2">
                <div className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  aiScore.score >= 90 ? "border-accent bg-accent/10" : "border-border"
                )}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">14B+</span>
                      {aiScore.score >= 90 && (
                        <Badge className="bg-accent text-accent-foreground text-xs">Best</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      Quantization: Q4_K_M / Q5_K_M
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">~20GB</span>
                </div>

                <div className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  aiScore.score >= 70 && aiScore.score < 90 ? "border-accent bg-accent/10" : "border-border"
                )}>
                  <div>
                    <span className="font-mono">13B</span>
                    <p className="text-xs text-muted-foreground font-mono">
                      Quantization: Q4_K_M / Q5_K_M
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">~9GB</span>
                </div>

                <div className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  aiScore.score >= 50 && aiScore.score < 70 ? "border-accent bg-accent/10" : "border-border"
                )}>
                  <div>
                    <span className="font-mono">7B</span>
                    <p className="text-xs text-muted-foreground font-mono">
                      Quantization: Q4_K_M / Q5_K_M / Q8_0
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">~5GB</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-4">
            <Button variant="outline" className="font-mono">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => setShowMachineSpecs(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
