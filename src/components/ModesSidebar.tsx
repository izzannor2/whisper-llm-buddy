import { useState } from 'react';
import {
  MessageSquare,
  Layers,
  Cpu,
  Terminal,
  Sparkles,
  GraduationCap,
  FlaskConical,
  Settings,
  WifiOff,
  Wifi,
  ChevronRight,
  ChevronDown,
  Zap,
  AlertTriangle,
  Plug,
  Box,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { IDEMode } from '@/lib/ide-types';

interface ModesSidebarProps {
  currentMode: IDEMode;
  onModeChange: (mode: IDEMode) => void;
  onOpenSettings: () => void;
  onCollapse?: () => void;
  collapsed?: boolean;
}

type ModeEntry = { id: IDEMode; name: string; description: string; icon: React.ReactNode };

const PRIMARY_MODES: ModeEntry[] = [
  { id: 'app-builder', name: 'App Builder', description: 'Full-stack web apps with live preview', icon: <Layers className="w-5 h-5" /> },
  { id: 'ide-coding', name: 'IDE / Coding', description: 'General coding chat and snippets', icon: <MessageSquare className="w-5 h-5" /> },
  { id: 'ai-improvement', name: 'AI Improvement', description: 'Modify this app itself', icon: <Sparkles className="w-5 h-5" /> },
  { id: 'embedded-iot', name: 'Embedded / IoT', description: 'ESP32, Arduino, Raspberry Pi', icon: <Cpu className="w-5 h-5" /> },
  { id: '3d-printing', name: '3D Printing', description: 'OpenSCAD models and STL export', icon: <Box className="w-5 h-5" /> },
];

const ADVANCED_MODES: ModeEntry[] = [
  { id: 'system-helper', name: 'System Helper', description: 'Computer tasks and cleanup', icon: <Terminal className="w-5 h-5" /> },
  { id: 'sandbox', name: 'Sandbox', description: 'Safe experimental environment', icon: <FlaskConical className="w-5 h-5" /> },
  { id: 'plugin', name: 'Plugins', description: 'Manage custom plugins', icon: <Plug className="w-5 h-5" /> },
  { id: 'jailbreak', name: 'Prompt Override', description: 'Custom system prompt', icon: <AlertTriangle className="w-5 h-5" /> },
  { id: 'learning', name: 'Learning Mode', description: 'Learn your style over time', icon: <GraduationCap className="w-5 h-5" /> },
];

export function ModesSidebar({
  currentMode,
  onModeChange,
  onOpenSettings,
  onCollapse,
}: ModesSidebarProps) {
  const { isOnline } = useNetworkStatus();
  const advancedHasActive = ADVANCED_MODES.some((m) => m.id === currentMode);
  const [advancedOpen, setAdvancedOpen] = useState(advancedHasActive);

  const renderMode = (mode: ModeEntry) => {
    const isActive = currentMode === mode.id;
    return (
      <button
        key={mode.id}
        onClick={() => onModeChange(mode.id)}
        className={cn(
          'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
          isActive
            ? 'bg-accent/10 text-accent'
            : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
        )}
      >
        <div className={cn('mt-0.5', isActive ? 'text-accent' : 'text-muted-foreground')}>
          {mode.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', isActive && 'text-accent')}>{mode.name}</p>
          <p className="text-xs text-muted-foreground truncate">{mode.description}</p>
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-4 flex items-center gap-3">
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

      <div className="px-3 pt-4 pb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Modes
        </span>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 py-1">
          {PRIMARY_MODES.map(renderMode)}

          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-lg text-xs uppercase tracking-wider text-muted-foreground hover:bg-sidebar-accent/50"
          >
            {advancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Advanced
          </button>

          {advancedOpen && <div className="space-y-1 pl-1">{ADVANCED_MODES.map(renderMode)}</div>}
        </div>
      </ScrollArea>

      <div className="p-2 border-t border-sidebar-border space-y-1">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground">
          {isOnline ? <Wifi className="w-5 h-5 text-accent" /> : <WifiOff className="w-5 h-5" />}
          <div className="text-left">
            <p className="text-sm font-medium">{isOnline ? 'Online' : 'Offline'}</p>
            <p className="text-xs text-muted-foreground">{isOnline ? 'Connected' : 'Not connected'}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start h-10 px-3 text-muted-foreground"
          onClick={onOpenSettings}
        >
          <Settings className="w-5 h-5 mr-3" />
          Settings
        </Button>
      </div>
    </div>
  );
}
