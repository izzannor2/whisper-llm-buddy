import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  MessageSquare, 
  Trash2, 
  Settings, 
  FolderOpen,
  Cpu,
  WifiOff,
  Wifi,
  Lock,
  Power,
  ChevronDown,
  Layers,
  Terminal,
  Sparkles,
  GraduationCap,
  FlaskConical,
  Zap,
  ChevronRight,
  AlertTriangle,
  Plug
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Conversation } from '@/lib/db';
import { cn } from '@/lib/utils';
import { isFileSystemSupported, openDirectory, getCurrentDirectory } from '@/lib/file-system';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useToast } from '@/hooks/use-toast';
import { IDEMode } from '@/lib/ide-types';

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
  currentMode?: IDEMode;
  onModeChange?: (mode: IDEMode) => void;
  onCollapse?: () => void;
}

const MODES_LIST: { id: IDEMode; name: string; icon: any; description: string }[] = [
  { id: 'app-builder', name: 'Chat', icon: MessageSquare, description: 'General conversation' },
  { id: 'app-builder', name: 'App Builder', icon: Layers, description: 'Full-stack web apps with preview' },
  { id: 'embedded-iot', name: 'IoT / Embedded', icon: Cpu, description: 'ESP32, Arduino, Pi' },
  { id: 'system-helper', name: 'System Helper', icon: Terminal, description: 'Computer tasks' },
  { id: 'ai-improvement', name: 'AI Improvement', icon: Sparkles, description: 'Self-modification' },
  { id: 'learning', name: 'Learning Mode', icon: GraduationCap, description: 'Learn your style' },
  { id: 'sandbox', name: 'Sandbox', icon: FlaskConical, description: 'Safe experiments' },
  { id: 'jailbreak', name: 'Uncensored', icon: AlertTriangle, description: 'Custom system prompts' },
  { id: 'plugin', name: 'Plugin Mode', icon: Plug, description: 'Custom plugins & tools' },
];

export function ChatSidebar({
  conversations,
  currentId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  currentMode = 'app-builder',
  onModeChange,
  onCollapse,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFolder, setProjectFolder] = useState<string | null>(null);
  const { isOnline } = useNetworkStatus();
  const { toast } = useToast();

  useEffect(() => {
    const dir = getCurrentDirectory();
    if (dir) setProjectFolder(dir.name);
  }, []);

  const handleOpenProject = async () => {
    if (!isFileSystemSupported()) {
      toast({
        variant: 'destructive',
        title: 'File System Access not supported',
        description: 'Use Chrome, Edge, or another Chromium browser',
      });
      return;
    }
    try {
      const dir = await openDirectory();
      if (dir) {
        setProjectFolder(dir.name);
        toast({ title: `Opened: ${dir.name}` });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: error.message });
    }
  };

  const filtered = searchQuery
    ? conversations.filter(c =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

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

  const currentModeData = MODES_LIST.find(m => m.id === currentMode) || MODES_LIST[0];
  const ModeIcon = currentModeData.icon;

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Header with branding */}
      <div className="p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-accent" />
        </div>
        <span className="font-semibold text-lg text-accent">LocalDev AI</span>
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8"
            onClick={onCollapse}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Mode Selector Dropdown */}
      <div className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between h-10 px-3 bg-sidebar-accent/50 hover:bg-sidebar-accent"
            >
              <div className="flex items-center gap-2">
                <ModeIcon className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">{currentModeData.name}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
            {MODES_LIST.map((mode, index) => {
              const Icon = mode.icon;
              // Skip duplicate 'Chat' which shares app-builder id
              if (index === 0) return null;
              return (
                <DropdownMenuItem
                  key={mode.name}
                  onClick={() => onModeChange?.(mode.id as IDEMode)}
                  className={cn(
                    "flex items-start gap-3 py-2.5 cursor-pointer",
                    currentMode === mode.id && "bg-accent/10"
                  )}
                >
                  <Icon className="w-4 h-4 mt-0.5 text-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{mode.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{mode.description}</p>
                  </div>
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
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-sidebar-accent/50 border-sidebar-border h-9 text-sm"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-2 space-y-0.5">
        <Button
          variant="ghost"
          className="w-full justify-start h-9 px-3 text-sm font-normal"
          onClick={onNew}
        >
          <Plus className="w-4 h-4 mr-3" />
          New Chat
        </Button>
        
        <Button
          variant="ghost"
          className="w-full justify-start h-9 px-3 text-sm font-normal"
          asChild
        >
          <Link to="/models">
            <Cpu className="w-4 h-4 mr-3" />
            Models
          </Link>
        </Button>

        {isFileSystemSupported() && (
          <Button
            variant="ghost"
            className="w-full justify-start h-9 px-3 text-sm font-normal"
            onClick={handleOpenProject}
          >
            <FolderOpen className="w-4 h-4 mr-3" />
            {projectFolder ? projectFolder : 'Files'}
          </Button>
        )}

        {/* Status Row */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Button variant="ghost" size="sm" className={cn(
            "h-7 px-2 text-xs font-normal",
            isOnline ? "text-accent" : "text-muted-foreground"
          )}>
            {isOnline ? <Wifi className="w-3.5 h-3.5 mr-1.5" /> : <WifiOff className="w-3.5 h-3.5 mr-1.5" />}
            {isOnline ? 'Online' : 'Offline'}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-normal text-muted-foreground">
            <Lock className="w-3.5 h-3.5 mr-1.5" />
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
              No chats yet
            </p>
          ) : (
            filtered.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                  currentId === conv.id
                    ? 'bg-sidebar-accent'
                    : 'hover:bg-sidebar-accent/50'
                )}
                onClick={() => onSelect(conv.id)}
              >
                <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{conv.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(conv.updatedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5">
        <Button
          variant="ghost"
          className="w-full justify-start h-9 px-3 text-sm font-normal text-muted-foreground"
          onClick={() => window.close()}
        >
          <Power className="w-4 h-4 mr-3" />
          Quit LocalDev
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start h-9 px-3 text-sm font-normal"
          onClick={onOpenSettings}
        >
          <Settings className="w-4 h-4 mr-3" />
          Settings
        </Button>
      </div>
    </div>
  );
}
