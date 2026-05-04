import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, Zap, OctagonX, Crown, Brain, Rocket, Network, BotIcon, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ChatSidebar } from '@/components/ChatSidebar';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput, ChatInputRef, type ChatInputProps } from '@/components/ChatInput';
// SettingsDialog removed — settings now live exclusively at /settings
import { TypingIndicator } from '@/components/TypingIndicator';
import { EmptyState } from '@/components/EmptyState';
import { CodeLibrary } from '@/components/CodeLibrary';
import { OpenClawOverlay } from '@/components/OpenClawOverlay';
import { LockScreen } from '@/components/LockScreen';
import { VoiceCallMode } from '@/components/VoiceCallMode';
import { MemoryPanel } from '@/components/MemoryPanel';
import { AgentActivityPanel, AgentStep } from '@/components/AgentActivityPanel';
import { SystemStatusBar } from '@/components/SystemStatusBar';
import { AutoBuildPanel } from '@/components/AutoBuildPanel';
import { TaskGraph } from '@/components/TaskGraph';
import { IDEMode } from '@/lib/ide-types';
import { getIDESettings, saveIDESettings } from '@/lib/ide-store';
import { applyModeTheme, getModeSystemPrompt } from '@/lib/mode-themes';
import { routeToAgent, AgentType } from '@/lib/agent-router';
import { getRelevantMemories } from '@/lib/memory-store';
import { getToolLearningHints } from '@/lib/tool-learning';
import { initOrchestrator } from '@/lib/orchestrator';
import { getAutonomousState, subscribeAutonomous, runAutonomous, stopAutonomous } from '@/lib/autonomous-mode';
import { isSafeMode } from '@/lib/permissions';
import {
  Conversation, Message, getAllConversations, getConversation,
  saveConversation, deleteConversation, generateId, initDB,
} from '@/lib/db';
import {
  ChatSettings, loadSettings, saveSettings, sendChatMessage,
  MultimodalContentPart,
} from '@/lib/chat-api';
import type { Attachment } from '@/components/ChatInput';
import { speak, isTTSSupported, stopSpeaking } from '@/lib/tts';
import { onOpenClawEvent } from '@/lib/openclaw-bridge';
import { cn } from '@/lib/utils';
import { searchWeb, formatSearchContext } from '@/lib/web-search';

export default function Index() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings());
  const [currentMode, setCurrentMode] = useState<IDEMode>(() => getIDESettings().mode);
  const [currentModeKey, setCurrentModeKey] = useState<string>(() => {
    const s = getIDESettings();
    return (s as any).modeKey || s.mode;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  // settingsOpen removed — settings page is /settings
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [codeLibraryOpen, setCodeLibraryOpen] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [openClawOpen, setOpenClawOpen] = useState(false);
  const [planningMode, setPlanningMode] = useState(false);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const [voiceCallMinimized, setVoiceCallMinimized] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [autoBuildOpen, setAutoBuildOpen] = useState(false);
  const [taskGraphOpen, setTaskGraphOpen] = useState(false);
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [autonomousStepCount, setAutonomousStepCount] = useState(0);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [llamaCppAvailable, setLlamaCppAvailable] = useState(false);
  const [llamaCppModels, setLlamaCppModels] = useState<string[]>([]);
  const [currentAgent, setCurrentAgent] = useState<AgentType | undefined>();
  const [isLocked, setIsLocked] = useState(() => sessionStorage.getItem('localdev-locked') === 'true');
  const [isOfflineMode, setIsOfflineMode] = useState(() => loadSettings().offlineMode);
  // settingsTab removed — pass via /settings?tab=… instead
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const { toast } = useToast();

  useEffect(() => { applyModeTheme(currentModeKey); }, [currentModeKey]);

  useEffect(() => {
    const init = async () => {
      await initDB();
      await initOrchestrator();
      setConversations(await getAllConversations());
      // Skip local scans when running in cloud preview
      const isCloud = window.location.hostname.includes('lovable.app') || window.location.hostname.includes('lovableproject.com');
      if (!isCloud) {
        // Scan Ollama models silently
        try {
          const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 3000);
          const res = await fetch(`${ollamaUrl}/api/tags`, { signal: ctrl.signal });
          clearTimeout(tid);
          if (res.ok) {
            const data = await res.json();
            setOllamaModels(data.models?.map((m: any) => m.name) || []);
          }
        } catch { /* silently ignore */ }
        // Scan llama.cpp server
        try {
          const ctrl2 = new AbortController();
          const tid2 = setTimeout(() => ctrl2.abort(), 3000);
          const res2 = await fetch('http://127.0.0.1:8081/health', { signal: ctrl2.signal });
          clearTimeout(tid2);
          if (res2.ok) {
            setLlamaCppAvailable(true);
            try {
              const ctrl3 = new AbortController();
              const tid3 = setTimeout(() => ctrl3.abort(), 3000);
              const res3 = await fetch('http://127.0.0.1:8081/v1/models', { signal: ctrl3.signal });
              clearTimeout(tid3);
              if (res3.ok) {
                const mdata = await res3.json();
                const names = (mdata.data || []).map((m: any) => m.id || m.object || 'local-model');
                setLlamaCppModels(names.length > 0 ? names : ['local-model']);
              }
            } catch { setLlamaCppModels(['local-model']); }
          }
        } catch { setLlamaCppAvailable(false); setLlamaCppModels([]); }
      }
    };
    init();

    // Listen for OpenClaw bridge events
    const unsubscribe = onOpenClawEvent((event) => {
      if (event.type === 'navigate' && event.payload.route) {
        navigate(event.payload.route);
      }
      if (event.type === 'send-to-chat' && event.payload.message) {
        handleSendMessage(event.payload.message);
      }
    });

    // Subscribe to autonomous mode state
    const unsubAuto = subscribeAutonomous((state) => {
      setAutonomousMode(state.active);
      setAutonomousStepCount(state.stepCount);
    });

    return () => { unsubscribe(); unsubAuto(); };
  }, []);

  // Periodic health check for active backend (every 30s)
  const [backendHealthy, setBackendHealthy] = useState(true);
  useEffect(() => {
    const isCloud = window.location.hostname.includes('lovable.app') || window.location.hostname.includes('lovableproject.com');
    if (isCloud) return;

    const checkHealth = async () => {
      try {
        if (settings.backend === 'ollama') {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 3000);
          const res = await fetch(`${settings.ollamaUrl || 'http://localhost:11434'}/api/tags`, { signal: ctrl.signal });
          clearTimeout(tid);
          setBackendHealthy(res.ok);
        } else if (settings.backend === 'local') {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 3000);
          const res = await fetch(`${settings.localUrl || 'http://127.0.0.1:8081'}/health`, { signal: ctrl.signal });
          clearTimeout(tid);
          setBackendHealthy(res.ok);
        } else {
          setBackendHealthy(true);
        }
      } catch {
        if (['ollama', 'local'].includes(settings.backend)) setBackendHealthy(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [settings.backend, settings.ollamaUrl, settings.localUrl]);

  useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      const tab = (e as CustomEvent)?.detail?.tab;
      navigate(tab ? `/settings?tab=${encodeURIComponent(tab)}` : '/settings');
    };
    window.addEventListener('open-settings', handleOpenSettings);
    return () => window.removeEventListener('open-settings', handleOpenSettings);
  }, [navigate]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [currentConversation?.messages, streamingContent]);

  const handleModeChange = (mode: IDEMode, key: string) => {
    setCurrentMode(mode);
    setCurrentModeKey(key);
    saveIDESettings({ mode, modeKey: key } as any);
    applyModeTheme(key);
    setKillSwitchActive(false);
    
    const ROUTE_MAP: Record<string, string> = {
      'app-builder': '/ide',
      'embedded-iot': '/iot',
      'sandbox': '/sandbox',
      'ai-improvement': '/improve',
    };
    
    if (ROUTE_MAP[key]) { navigate(ROUTE_MAP[key]); return; }
    toast({ title: `Switched to ${MODES_LIST_NAMES[key] || key}` });
  };

  const handleToggleLock = () => {
    if (isLocked) return; // Unlock via LockScreen component
    setIsLocked(true);
    sessionStorage.setItem('localdev-locked', 'true');
  };

  const handleUnlock = () => {
    setIsLocked(false);
    sessionStorage.removeItem('localdev-locked');
  };

  const handleToggleOffline = () => {
    const newOffline = !isOfflineMode;
    setIsOfflineMode(newOffline);
    const s = { ...settings, offlineMode: newOffline };
    setSettings(s);
    saveSettings(s);
    // Auto-sync web search with online/offline
    setWebSearchEnabled(!newOffline);
    toast({ title: newOffline ? 'Offline mode — local backends only' : 'Online mode — web search enabled' });
  };

  const handleKillSwitch = () => {
    abortRef.current?.abort();
    stopSpeaking();
    setStreamingContent('');
    setIsLoading(false);
    setKillSwitchActive(true);
    toast({ title: '⛔ KILLED — All operations stopped', variant: 'destructive' });
    setTimeout(() => setKillSwitchActive(false), 3000);
  };

  const loadConversation = async (id: string) => {
    const conv = await getConversation(id);
    if (conv) setCurrentConversation(conv);
  };

  const createNewConversation = () => { setCurrentConversation(null); setStreamingContent(''); };

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversation?.id === id) setCurrentConversation(null);
    toast({ title: 'Chat deleted' });
  };

  const handleSendMessage = async (content: string, isPlan?: boolean, attachments?: Attachment[]) => {
    // If autonomous mode is on, run the autonomous loop
    if (autonomousMode && !isPlan) {
      return handleAutonomousMessage(content);
    }
    return sendMessageAndGetResponse(content, isPlan, attachments);
  };
  const handleVoiceCallMessage = async (content: string): Promise<string> => sendMessageAndGetResponse(content);

  const handleAutonomousMessage = async (content: string): Promise<string> => {
    // Create user message first
    const userMessage: Message = { id: generateId(), role: 'user', content, timestamp: Date.now() };
    let conv = currentConversation;
    if (!conv) {
      conv = { id: generateId(), title: `🤖 ${content.slice(0, 40)}...`, messages: [], createdAt: Date.now(), updatedAt: Date.now(), model: settings.model, modeKey: currentModeKey };
    }
    conv = { ...conv, messages: [...conv.messages, userMessage], updatedAt: Date.now() };
    setCurrentConversation(conv);
    await saveConversation(conv);
    setConversations(prev => {
      const existing = prev.find(c => c.id === conv!.id);
      if (existing) return prev.map(c => (c.id === conv!.id ? conv! : c));
      return [conv!, ...prev];
    });

    setIsLoading(true);
    setStreamingContent('');
    let fullResponse = '';

    try {
      fullResponse = await runAutonomous(
        content,
        (chunk) => { fullResponse += chunk; setStreamingContent(fullResponse); },
        (step, summary) => {
          const agentStep: AgentStep = {
            id: generateId(), agentType: 'automation',
            action: `Step ${step}`, status: 'complete',
            detail: summary, timestamp: Date.now(),
          };
          setAgentSteps(prev => [...prev.slice(-30), agentStep]);
        },
        settings
      );

      const assistantMessage: Message = { id: generateId(), role: 'assistant', content: fullResponse, timestamp: Date.now() };
      const updatedConv = { ...conv, messages: [...conv.messages, assistantMessage], updatedAt: Date.now() };
      setCurrentConversation(updatedConv);
      await saveConversation(updatedConv);
      setConversations(prev => prev.map(c => (c.id === updatedConv.id ? updatedConv : c)));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Autonomous mode error', description: err.message });
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
    return fullResponse;
  };

  const sendMessageAndGetResponse = async (content: string, isPlan?: boolean, attachments?: Attachment[]): Promise<string> => {
    // Build message attachments for storage
    const messageAttachments = attachments?.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl }));
    const userMessage: Message = { id: generateId(), role: 'user', content, timestamp: Date.now(), attachments: messageAttachments };
    let conv = currentConversation;
    if (!conv) {
      conv = { id: generateId(), title: content.slice(0, 50) + (content.length > 50 ? '...' : ''), messages: [], createdAt: Date.now(), updatedAt: Date.now(), model: settings.model, modeKey: currentModeKey };
    }
    conv = { ...conv, messages: [...conv.messages, userMessage], updatedAt: Date.now() };
    setCurrentConversation(conv);
    await saveConversation(conv);
    setConversations(prev => {
      const existing = prev.find(c => c.id === conv!.id);
      if (existing) return prev.map(c => (c.id === conv!.id ? conv! : c));
      return [conv!, ...prev];
    });

    setIsLoading(true);
    setStreamingContent('');
    setModelLoaded(true);
    abortRef.current = new AbortController();

    let fullResponse = '';
    try {
      // Build chat messages — for the last user message, include attachments as multimodal content
      const chatMessages = conv.messages.map(m => {
        if (m.attachments && m.attachments.length > 0) {
          const parts: MultimodalContentPart[] = [];
          // Add text file contents as context
          const textAttachments = attachments?.filter(a => a.textContent) || [];
          for (const ta of textAttachments) {
            parts.push({ type: 'text', text: `--- File: ${ta.name} ---\n${ta.textContent}\n---` });
          }
          // Add non-image file mentions
          const binaryAttachments = m.attachments.filter(a => !a.type.startsWith('image/') && !textAttachments.find(t => t.name === a.name));
          for (const ba of binaryAttachments) {
            parts.push({ type: 'text', text: `[Attached file: ${ba.name} (${ba.type})]` });
          }
          // Add the user's text message
          if (m.content) parts.push({ type: 'text', text: m.content });
          // Add images
          const imageAttachments = m.attachments.filter(a => a.dataUrl && a.type.startsWith('image/'));
          for (const ia of imageAttachments) {
            parts.push({ type: 'image_url', image_url: { url: ia.dataUrl! } });
          }
          return { role: m.role, content: parts.length > 0 ? parts : m.content };
        }
        return { role: m.role, content: m.content };
      });
      const modePrompt = getModeSystemPrompt(currentModeKey, (settings as any).jailbreakPrompt);
      const effectiveSettings = { ...settings };
      const planningPrefix = isPlan
        ? `You are in PLANNING MODE. Do NOT write code yet. Instead:\n1. Ask clarifying questions about requirements\n2. Outline architecture and file structure\n3. List technologies and libraries to use\n4. Break the project into implementation steps\n5. Only when the user says "start building" should you switch to code generation.\n\n`
        : '';

      // Agent routing — classify intent
      const routeResult = routeToAgent(content);
      setCurrentAgent(routeResult.agent.type);
      const agentStep: AgentStep = {
        id: generateId(), agentType: routeResult.agent.type,
        action: `${routeResult.agent.emoji} ${routeResult.agent.name}`,
        status: 'running', detail: routeResult.reasoning, timestamp: Date.now(),
      };
      setAgentSteps(prev => [...prev.slice(-20), agentStep]);

      // Web search
      let searchContext = '';
      if (webSearchEnabled) {
        try {
          toast({ title: '🔍 Searching the web…' });
          const searchResult = await searchWeb(content);
          if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
            searchContext = '\n\n' + formatSearchContext(searchResult.results);
            toast({ title: `🔍 Found ${searchResult.results.length} web results`, duration: 2000 });
          } else {
            toast({ title: '🔍 No web results found', duration: 2000 });
          }
        } catch (e) {
          console.error('Web search failed, continuing without:', e);
        }
      }

      // Memory injection
      let memoryContext = '';
      try {
        memoryContext = await getRelevantMemories(content);
      } catch { /* ignore */ }

      const agentPrompt = routeResult.agent.systemPrompt || '';
      const toolHints = getToolLearningHints();

      if (modePrompt || planningPrefix || searchContext || memoryContext || agentPrompt || toolHints) {
        effectiveSettings.systemPrompt = planningPrefix + agentPrompt + (agentPrompt ? '\n\n' : '') + (modePrompt || '') + searchContext + memoryContext + toolHints + (settings.systemPrompt ? '\n\n' + settings.systemPrompt : '');
      }

      await sendChatMessage(chatMessages, effectiveSettings, (chunk) => { fullResponse += chunk; setStreamingContent(fullResponse); }, { role: 'assistant' });

      // Update agent step
      setAgentSteps(prev => prev.map(s => s.id === agentStep.id ? { ...s, status: 'complete', duration: Date.now() - agentStep.timestamp } : s));
      setCurrentAgent(undefined);

      const assistantMessage: Message = { id: generateId(), role: 'assistant', content: fullResponse, timestamp: Date.now() };
      const updatedConv = { ...conv, messages: [...conv.messages, assistantMessage], updatedAt: Date.now() };
      setCurrentConversation(updatedConv);
      await saveConversation(updatedConv);
      setConversations(prev => prev.map(c => (c.id === updatedConv.id ? updatedConv : c)));

      if (settings.autoPlayTTS && isTTSSupported() && fullResponse) {
        speak(fullResponse, {
          voice: settings.ttsVoice,
          rate: settings.ttsRate,
          // Do NOT auto-relisten in main chat — mic is "type into field" only
        });
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      toast({ variant: 'destructive', title: 'Failed to send message', description: err.message || 'Check your connection and settings' });
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
    return fullResponse;
  };

  const handleEditMessage = async (id: string, content: string) => {
    if (!currentConversation) return;
    const idx = currentConversation.messages.findIndex(m => m.id === id);
    if (idx === -1) return;
    const updatedMessages = currentConversation.messages.slice(0, idx);
    updatedMessages.push({ ...currentConversation.messages[idx], content });
    const updatedConv = { ...currentConversation, messages: updatedMessages, updatedAt: Date.now() };
    setCurrentConversation(updatedConv);
    await saveConversation(updatedConv);
    handleSendMessage(content);
  };

  const handleDeleteMessage = async (id: string) => {
    if (!currentConversation) return;
    const updatedMessages = currentConversation.messages.filter(m => m.id !== id);
    const updatedConv = { ...currentConversation, messages: updatedMessages, updatedAt: Date.now() };
    setCurrentConversation(updatedConv);
    await saveConversation(updatedConv);
    setConversations(prev => prev.map(c => (c.id === updatedConv.id ? updatedConv : c)));
  };

  const handleSettingsSave = (newSettings: ChatSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    toast({ title: 'Settings saved' });
  };

  // Mode-specific styling
  const getModeClasses = () => {
    switch (currentModeKey) {
      case 'system-helper': return 'font-mono';
      case 'jailbreak': return '';
      case 'all-in-one': return '';
      default: return '';
    }
  };

  const getModeBackground = () => {
    switch (currentModeKey) {
      case 'system-helper': return 'bg-[hsl(45,10%,5%)]';
      case 'jailbreak': return 'bg-[hsl(0,15%,5%)]';
      case 'learning': return 'bg-[hsl(142,15%,5%)]';
      case 'plugin': return 'bg-[hsl(220,20%,6%)]';
      case 'all-in-one': return 'bg-[hsl(30,10%,5%)]';
      default: return 'bg-background';
    }
  };

  if (isLocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className={cn("flex h-screen overflow-hidden", getModeBackground())}>
      {/* Mobile sidebar toggle */}
      <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Sidebar */}
      <div className={cn('fixed lg:relative inset-y-0 left-0 z-40 w-72 transform transition-transform duration-200 ease-in-out lg:translate-x-0', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
        <ChatSidebar
          conversations={conversations}
          currentId={currentConversation?.id || null}
          onSelect={loadConversation}
          onNew={createNewConversation}
          onDelete={handleDeleteConversation}
          onOpenSettings={() => navigate('/settings')}
          onOpenMemory={() => setMemoryPanelOpen(true)}
           onOpenAutoBuild={() => setAutoBuildOpen(true)}
           onOpenTaskGraph={() => setTaskGraphOpen(true)}
          currentMode={currentMode}
          currentModeKey={currentModeKey}
          onModeChange={handleModeChange}
          onCollapse={() => setSidebarOpen(false)}
          isLocked={isLocked}
          onToggleLock={handleToggleLock}
          isOfflineMode={isOfflineMode}
          onToggleOffline={handleToggleOffline}
        />
      </div>

      {sidebarOpen && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main chat area */}
      <div className={cn("flex-1 flex flex-col min-w-0", getModeClasses())}>
        {/* Backend health warning */}
        {!backendHealthy && ['ollama', 'local'].includes(settings.backend) && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-destructive/30 bg-destructive/5">
            <div className="flex items-center gap-2">
              <OctagonX className="w-4 h-4 text-destructive" />
              <span className="text-xs font-medium text-destructive">
                {settings.backend === 'ollama' ? 'Ollama' : 'Llama.cpp'} server is not responding
              </span>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
              navigate('/settings?tab=debug');
            }}>
              Diagnostics
            </Button>
          </div>
        )}
        {/* Kill switch banner for all-in-one */}
        {currentModeKey === 'all-in-one' && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-amber-500/20" style={{ background: 'linear-gradient(90deg, hsl(38,92%,50%,0.05), hsl(340,82%,52%,0.05), hsl(262,83%,58%,0.05))' }}>
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold bg-gradient-to-r from-amber-400 via-rose-400 to-purple-400 bg-clip-text text-transparent">ALL-IN-ONE MODE</span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 gap-1.5 text-xs font-bold bg-red-600 hover:bg-red-500"
              onClick={handleKillSwitch}
            >
              <OctagonX className="w-3.5 h-3.5" />
              KILL SWITCH
            </Button>
          </div>
        )}

        {/* Autonomous Mode + Task Graph toolbar */}
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <BotIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Autonomous</span>
            <Switch checked={autonomousMode} onCheckedChange={(checked) => {
              if (!checked) stopAutonomous();
              setAutonomousMode(checked);
            }} />
            {autonomousMode && (
              <span className="text-xs text-primary animate-pulse">Step {autonomousStepCount}</span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setTaskGraphOpen(true)}>
            <Network className="w-3.5 h-3.5" />
            Tasks
          </Button>
          {isSafeMode() && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="w-3 h-3" />
              Safe Mode
            </div>
          )}
          <div className="ml-auto"><SystemStatusBar buildState={isLoading ? 'generating' : 'idle'} /></div>
        </div>

        {/* Kill switch activated banner */}
        {killSwitchActive && (
          <div className="flex items-center justify-center py-2 bg-destructive text-destructive-foreground text-sm font-bold animate-pulse">
            ⛔ ALL OPERATIONS KILLED
          </div>
        )}

        {/* Mode-specific scanline overlay for System Helper */}
        {currentModeKey === 'system-helper' && (
          <div className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]" style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(45,93%,47%,0.1) 2px, hsl(45,93%,47%,0.1) 4px)',
          }} />
        )}

        {/* Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="max-w-4xl mx-auto py-6 px-4 h-full">
            {!currentConversation || currentConversation.messages.length === 0 ? (
              <EmptyState mode={currentMode} modeKey={currentModeKey} />
            ) : (
              <div className="space-y-6">
                {currentConversation.messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    onEdit={msg.role === 'user' ? handleEditMessage : undefined}
                    onDelete={handleDeleteMessage}
                    onAddToInput={(text) => chatInputRef.current?.appendMessage(text)}
                  />
                ))}
                {streamingContent && (
                  <ChatMessage
                    message={{ id: 'streaming', role: 'assistant', content: streamingContent, timestamp: Date.now() }}
                    onAddToInput={(text) => chatInputRef.current?.appendMessage(text)}
                  />
                )}
                {isLoading && !streamingContent && <TypingIndicator />}
                {/* Agent Activity */}
                <AgentActivityPanel steps={agentSteps} currentAgent={currentAgent} isProcessing={isLoading} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <ChatInput
          ref={chatInputRef}
          onSend={handleSendMessage}
          isLoading={isLoading}
          onStop={() => abortRef.current?.abort()}
          autoSendOnVoice={false}
          modelLoaded={modelLoaded}
          modeKey={currentModeKey}
          planningMode={planningMode}
          onPlanningToggle={setPlanningMode}
          webSearchEnabled={webSearchEnabled}
          onWebSearchToggle={setWebSearchEnabled}
          isOfflineMode={isOfflineMode}
          onVoiceCall={() => setShowVoiceCall(true)}
          availableOllamaModels={ollamaModels}
          llamaCppAvailable={llamaCppAvailable}
          llamaCppModels={llamaCppModels}
          onSettingsChange={(s) => { setSettings(s); }}
        />
      </div>

      {/* SettingsDialog removed — see /settings page */}
      <MemoryPanel open={memoryPanelOpen} onOpenChange={setMemoryPanelOpen} />
      <AutoBuildPanel open={autoBuildOpen} onOpenChange={setAutoBuildOpen} onSendMessage={handleSendMessage} />
      <TaskGraph open={taskGraphOpen} onOpenChange={setTaskGraphOpen} />
      {codeLibraryOpen && <div className="fixed inset-y-0 right-0 w-80 z-50 shadow-xl"><CodeLibrary onClose={() => setCodeLibraryOpen(false)} /></div>}

      {settings.openClawEnabled && openClawOpen && (
        <OpenClawOverlay
          onClose={() => setOpenClawOpen(false)}
          onOpenSettings={() => navigate('/settings')}
          config={{ model: settings.openClawModel, autoBackup: settings.openClawAutoBackup, learningEnabled: settings.openClawLearning, murmurUpdates: settings.openClawMurmur }}
          ttsSettings={{ voice: settings.ttsVoice, rate: settings.ttsRate }}
        />
      )}

      {settings.openClawEnabled && !openClawOpen && (
        <Button
          onClick={() => setOpenClawOpen(true)}
          className="fixed bottom-24 right-6 z-50 h-12 w-12 rounded-full shadow-lg bg-gradient-to-br from-primary to-primary/70 hover:scale-105 transition-transform"
          size="icon" title="Open OpenClaw Agent"
        >
          <Zap className="h-5 w-5" />
        </Button>
      )}

      {showVoiceCall && (
        <VoiceCallMode
          onSendMessage={async (content, _screenshot) => handleVoiceCallMessage(content)}
          ttsVoice={settings.ttsVoice}
          ttsRate={settings.ttsRate}
          onEnd={() => { setShowVoiceCall(false); setVoiceCallMinimized(false); }}
          autoStart
          onMinimizedChange={setVoiceCallMinimized}
          existingMessages={currentConversation?.messages
            .filter(m => m.role !== 'system')
            .map(m => ({
              id: m.id, role: m.role as 'user' | 'assistant', content: m.content, timestamp: m.timestamp,
            })) || []}
        />
      )}
    </div>
  );
}

const MODES_LIST_NAMES: Record<string, string> = {
  chat: 'Chat',
  'app-builder': 'App Builder',
  'embedded-iot': 'IoT / Embedded',
  'system-helper': 'System Helper',
  'ai-improvement': 'AI Improvement',
  learning: 'Learning Mode',
  sandbox: 'Sandbox',
  jailbreak: 'Uncensored',
  plugin: 'Plugin Mode',
  'all-in-one': 'All-in-One AI',
};
