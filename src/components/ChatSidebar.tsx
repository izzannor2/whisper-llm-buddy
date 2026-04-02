import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, Search, MessageSquare, Trash2, Settings, FolderOpen,
  Cpu, WifiOff, Wifi, Lock, Unlock, Power, ChevronDown,
  Layers, Terminal, Sparkles, GraduationCap, FlaskConical, Zap,
  ChevronRight, AlertTriangle, Plug, Crown, FolderHeart,
  FileSearch, HardDrive, MonitorSmartphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Conversation } from '@/lib/db';
import { cn } from '@/lib/utils';
import { isFileSystemSupported, openDirectory, getCurrentDirectory } from '@/lib/file-system';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useToast } from '@/hooks/use-toast';
import { IDEMode } from '@/lib/ide-types';
import { getModeTheme } from '@/lib/mode-themes';

interface ChatSidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onOpenCodeLibrary?: () => void;
  onOpenModels?: () => void;
  onOpenMemory?: () => void;
  onOpenAutoBuild?: () => void;
  currentMode?: IDEMode;
  currentModeKey?: string;
  onModeChange?: (mode: IDEMode, key: string) => void;
  onCollapse?: () => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  isOfflineMode?: boolean;
  onToggleOffline?: () => void;
}

const MODES_LIST: { key: string; id: IDEMode; name: string; icon: any; description: string }[] = [
  { key: 'chat', id: 'app-builder', name: 'Chat', icon: MessageSquare, description: 'General conversation' },
  { key: 'app-builder', id: 'app-builder', name: 'App Builder', icon: Layers, description: 'Full-stack web apps with preview' },
  { key: 'embedded-iot', id: 'embedded-iot', name: 'IoT / Embedded', icon: Cpu, description: 'ESP32, Arduino, Pi' },
  { key: 'system-helper', id: 'system-helper', name: 'System Helper', icon: Terminal, description: 'Computer tasks' },
  { key: 'ai-improvement', id: 'ai-improvement', name: 'AI Improvement', icon: Sparkles, description: 'Self-modification' },
  { key: 'learning', id: 'learning', name: 'Learning Mode', icon: GraduationCap, description: 'Learn your style' },
  { key: 'sandbox', id: 'sandbox', name: 'Sandbox', icon: FlaskConical, description: 'Safe experiments' },
  { key: 'jailbreak', id: 'jailbreak', name: 'Uncensored', icon: AlertTriangle, description: 'Custom system prompts' },
  { key: 'plugin', id: 'plugin', name: 'Plugin Mode', icon: Plug, description: 'Custom plugins & tools' },
  { key: 'all-in-one', id: 'app-builder', name: 'All-in-One AI', icon: Crown, description: 'Unlimited capabilities' },
];

const MODE_ICON_MAP: Record<string, { icon: any; color: string }> = {
  chat: { icon: MessageSquare, color: 'text-teal-400' },
  'app-builder': { icon: Layers, color: 'text-purple-400' },
  'embedded-iot': { icon: Cpu, color: 'text-orange-400' },
  'system-helper': { icon: Terminal, color: 'text-amber-400' },
  'ai-improvement': { icon: Sparkles, color: 'text-pink-400' },
  learning: { icon: GraduationCap, color: 'text-green-400' },
  sandbox: { icon: FlaskConical, color: 'text-cyan-400' },
  jailbreak: { icon: AlertTriangle, color: 'text-red-400' },
  plugin: { icon: Plug, color: 'text-blue-400' },
  'all-in-one': { icon: Crown, color: 'text-amber-400' },
};

export function ChatSidebar({
  conversations, currentId, onSelect, onNew, onDelete, onOpenSettings,
  currentMode = 'app-builder', currentModeKey, onModeChange, onCollapse,
  isLocked, onToggleLock, isOfflineMode, onToggleOffline,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFolder, setProjectFolder] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<string | null>(null);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [pcSearchResults, setPcSearchResults] = useState<string[]>([]);
  const [pcSearching, setPcSearching] = useState(false);
  const { isOnline } = useNetworkStatus();
  const { toast } = useToast();

  useEffect(() => {
    const dir = getCurrentDirectory();
    if (dir) setProjectFolder(dir.name);
  }, []);

  const handleOpenProject = async () => {
    if (!isFileSystemSupported()) {
      toast({ variant: 'destructive', title: 'File System Access not supported', description: 'Use Chrome, Edge, or another Chromium browser' });
      return;
    }
    try {
      const dir = await openDirectory();
      if (dir) { setProjectFolder(dir.name); toast({ title: `Opened: ${dir.name}` }); }
    } catch (error: any) {
      toast({ variant: 'destructive', title: error.message });
    }
  };

  const handlePCSearch = async () => {
    if (!isFileSystemSupported()) {
      toast({ variant: 'destructive', title: 'File System Access not supported' });
      return;
    }
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      setPcSearching(true);
      const results: string[] = [];
      const searchDir = async (handle: any, path: string) => {
        for await (const [name, entry] of handle.entries()) {
          const fullPath = `${path}/${name}`;
          if (entry.kind === 'file') results.push(fullPath);
          else if (entry.kind === 'directory' && !name.startsWith('.') && name !== 'node_modules') {
            await searchDir(entry, fullPath);
          }
          if (results.length > 500) return;
        }
      };
      await searchDir(dirHandle, dirHandle.name);
      setPcSearchResults(results);
      setFileSearchOpen(true);
      setPcSearching(false);
    } catch (e: any) {
      setPcSearching(false);
      if (e.name !== 'AbortError') toast({ variant: 'destructive', title: 'Failed to search' });
    }
  };

  // Filter conversations
  let filtered = conversations;
  if (filterMode) {
    filtered = filtered.filter(c => c.modeKey === filterMode);
  }
  if (searchQuery) {
    filtered = filtered.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  // Search across all conversations content
  const fileSearchResults = fileSearchQuery.trim()
    ? conversations.filter(c =>
        c.title.toLowerCase().includes(fileSearchQuery.toLowerCase()) ||
        c.messages.some(m => m.content.toLowerCase().includes(fileSearchQuery.toLowerCase()))
      )
    : [];

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const currentModeData = MODES_LIST.find(m => m.key === currentModeKey) || MODES_LIST.find(m => m.id === currentMode) || MODES_LIST[0];
  const ModeIcon = currentModeData.icon;
  const effectiveOnline = isOnline && !isOfflineMode;

  const getConvModeInfo = (conv: Conversation) => {
    const key = conv.modeKey || 'chat';
    return MODE_ICON_MAP[key] || MODE_ICON_MAP.chat;
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-accent" />
        </div>
        <span className="font-semibold text-lg text-accent">LocalDev AI</span>
        {onCollapse && (
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={onCollapse}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Mode Selector */}
      <div className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-between h-10 px-3 bg-sidebar-accent/50 hover:bg-sidebar-accent">
              <div className="flex items-center gap-2">
                <ModeIcon className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">{currentModeData.name}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
            {MODES_LIST.map((mode) => {
              const Icon = mode.icon;
              const theme = getModeTheme(mode.key);
              return (
                <DropdownMenuItem
                  key={mode.key}
                  onClick={() => onModeChange?.(mode.id, mode.key)}
                  className={cn("flex items-start gap-3 py-2.5 cursor-pointer", currentModeKey === mode.key && "bg-accent/10")}
                >
                  <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", theme.iconColorClass)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{mode.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{mode.description}</p>
                  </div>
                  {currentModeKey === mode.key && (
                    <div className="w-2 h-2 rounded-full ml-auto mt-1.5 shrink-0" style={{ background: `hsl(${theme.accent})` }} />
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search chats..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 bg-sidebar-accent/50 border-sidebar-border h-9 text-sm" />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-2 space-y-0.5">
        <Button variant="ghost" className="w-full justify-start h-9 px-3 text-sm font-normal" onClick={onNew}>
          <Plus className="w-4 h-4 mr-3" />New Chat
        </Button>

        {/* My Apps - filter to app-builder conversations */}
        <Button variant="ghost" className={cn("w-full justify-start h-9 px-3 text-sm font-normal", filterMode === 'app-builder' && "bg-sidebar-accent")}
          onClick={() => setFilterMode(filterMode === 'app-builder' ? null : 'app-builder')}>
          <FolderHeart className="w-4 h-4 mr-3 text-purple-400" />My Apps
          <span className="ml-auto text-xs text-muted-foreground">{conversations.filter(c => c.modeKey === 'app-builder').length}</span>
        </Button>

        {/* File Search */}
        <Button variant="ghost" className="w-full justify-start h-9 px-3 text-sm font-normal" onClick={() => setFileSearchOpen(true)}>
          <FileSearch className="w-4 h-4 mr-3 text-blue-400" />File Search
        </Button>

        <Button variant="ghost" className="w-full justify-start h-9 px-3 text-sm font-normal" asChild>
          <Link to="/models">
            <Cpu className="w-4 h-4 mr-3" />Models
          </Link>
        </Button>

        {/* System Files */}
        {isFileSystemSupported() && (
          <Button variant="ghost" className="w-full justify-start h-9 px-3 text-sm font-normal" onClick={handleOpenProject}>
            <HardDrive className="w-4 h-4 mr-3 text-amber-400" />
            {projectFolder ? `System: ${projectFolder}` : 'System Files'}
          </Button>
        )}

        {/* PC Search */}
        {isFileSystemSupported() && (
          <Button variant="ghost" className="w-full justify-start h-9 px-3 text-sm font-normal" onClick={handlePCSearch} disabled={pcSearching}>
            <MonitorSmartphone className="w-4 h-4 mr-3 text-green-400" />
            {pcSearching ? 'Scanning...' : 'PC Search'}
          </Button>
        )}

        {/* Mode filter chips */}
        {filterMode && filterMode !== 'app-builder' && (
          <Button variant="ghost" size="sm" className="w-full justify-start h-7 px-3 text-xs text-muted-foreground"
            onClick={() => setFilterMode(null)}>
            ✕ Clear filter: {MODES_LIST.find(m => m.key === filterMode)?.name}
          </Button>
        )}

        {/* Status Row */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Button variant="ghost" size="sm"
            className={cn("h-7 px-2 text-xs font-normal", effectiveOnline ? "text-accent" : "text-muted-foreground")}
            onClick={onToggleOffline}
            title={isOfflineMode ? "Switch to online mode" : "Switch to offline mode (local only)"}>
            {effectiveOnline ? <Wifi className="w-3.5 h-3.5 mr-1.5" /> : <WifiOff className="w-3.5 h-3.5 mr-1.5" />}
            {effectiveOnline ? 'Online' : 'Offline'}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-normal text-muted-foreground" onClick={onToggleLock} title="Lock screen for privacy">
            {isLocked ? <Unlock className="w-3.5 h-3.5 mr-1.5" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
            Lock
          </Button>
        </div>
      </div>

      <Separator className="my-2 bg-sidebar-border" />

      {/* Conversations list */}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-0.5 py-1">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              {filterMode ? `No ${MODES_LIST.find(m => m.key === filterMode)?.name || filterMode} chats` : 'No chats yet'}
            </p>
          ) : (
            filtered.map((conv) => {
              const modeInfo = getConvModeInfo(conv);
              const ModeIc = modeInfo.icon;
              return (
                <div key={conv.id}
                  className={cn('group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                    currentId === conv.id ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50')}
                  onClick={() => onSelect(conv.id)}>
                  <ModeIc className={cn("w-3.5 h-3.5 shrink-0", modeInfo.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(conv.updatedAt)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5">
        <Button variant="ghost" className="w-full justify-start h-9 px-3 text-sm font-normal text-muted-foreground" onClick={() => window.close()}>
          <Power className="w-4 h-4 mr-3" />Quit LocalDev
        </Button>
        <Button variant="ghost" className="w-full justify-start h-9 px-3 text-sm font-normal" onClick={onOpenSettings}>
          <Settings className="w-4 h-4 mr-3" />Settings
        </Button>
      </div>

      {/* File Search Dialog */}
      <Dialog open={fileSearchOpen} onOpenChange={setFileSearchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-accent" />
              {pcSearchResults.length > 0 ? 'PC Files' : 'Search Conversations'}
            </DialogTitle>
          </DialogHeader>
          {pcSearchResults.length > 0 ? (
            <div>
              <Input placeholder="Filter files..." value={fileSearchQuery} onChange={e => setFileSearchQuery(e.target.value)} className="mb-3" autoFocus />
              <ScrollArea className="h-64">
                <div className="space-y-1">
                  {pcSearchResults
                    .filter(f => !fileSearchQuery || f.toLowerCase().includes(fileSearchQuery.toLowerCase()))
                    .slice(0, 100)
                    .map((f, i) => (
                      <div key={i} className="text-xs font-mono px-2 py-1.5 rounded hover:bg-accent/10 cursor-pointer truncate text-muted-foreground">{f}</div>
                    ))}
                </div>
              </ScrollArea>
              <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={() => { setPcSearchResults([]); setFileSearchQuery(''); }}>
                Switch to conversation search
              </Button>
            </div>
          ) : (
            <div>
              <Input placeholder="Search all messages..." value={fileSearchQuery} onChange={e => setFileSearchQuery(e.target.value)} autoFocus />
              {fileSearchQuery.trim() && (
                <ScrollArea className="h-64 mt-3">
                  <div className="space-y-1">
                    {fileSearchResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No results</p>
                    ) : (
                      fileSearchResults.map(conv => {
                        const mi = getConvModeInfo(conv);
                        const MI = mi.icon;
                        return (
                          <div key={conv.id} className="flex items-center gap-2 px-2 py-2 rounded hover:bg-accent/10 cursor-pointer"
                            onClick={() => { onSelect(conv.id); setFileSearchOpen(false); setFileSearchQuery(''); }}>
                            <MI className={cn("w-3.5 h-3.5 shrink-0", mi.color)} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm truncate">{conv.title}</p>
                              <p className="text-xs text-muted-foreground">{conv.messages.length} messages</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
