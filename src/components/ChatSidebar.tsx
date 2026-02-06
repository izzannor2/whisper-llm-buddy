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
  Power
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Conversation } from '@/lib/db';
import { cn } from '@/lib/utils';
import { isFileSystemSupported, openDirectory, getCurrentDirectory } from '@/lib/file-system';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useToast } from '@/hooks/use-toast';

interface ChatSidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenCodeLibrary?: () => void;
  onOpenModels?: () => void;
}

export function ChatSidebar({
  conversations,
  currentId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  onOpenModels,
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

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-sidebar-accent/50 border-sidebar-border h-9 text-sm"
          />
        </div>
      </div>

      {/* Menu Items */}
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
