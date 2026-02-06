import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  Zap,
  AlertTriangle,
  Plug
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { IDEMode, MODE_INFO } from '@/lib/ide-types';
import { getIDESettings, saveIDESettings } from '@/lib/ide-store';

interface ModesSidebarProps {
  currentMode: IDEMode;
  onModeChange: (mode: IDEMode) => void;
  onOpenSettings: () => void;
  onCollapse?: () => void;
  collapsed?: boolean;
}

const MODE_ICONS: Record<IDEMode | 'chat', React.ReactNode> = {
  'chat': <MessageSquare className="w-5 h-5" />,
  'app-builder': <Layers className="w-5 h-5" />,
  'embedded-iot': <Cpu className="w-5 h-5" />,
  'system-helper': <Terminal className="w-5 h-5" />,
  'ai-improvement': <Sparkles className="w-5 h-5" />,
  'learning': <GraduationCap className="w-5 h-5" />,
  'sandbox': <FlaskConical className="w-5 h-5" />,
  'jailbreak': <AlertTriangle className="w-5 h-5" />,
  'plugin': <Plug className="w-5 h-5" />,
};

const MODES_LIST: { id: IDEMode | 'chat'; name: string; description: string }[] = [
  { id: 'chat', name: 'Chat', description: 'General conversation and Q&A' },
  { id: 'app-builder', name: 'App Builder', description: 'Full-stack web apps with live preview' },
  { id: 'embedded-iot', name: 'IoT / Embedded', description: 'ESP32, Arduino, Raspberry Pi code' },
  { id: 'system-helper', name: 'System Helper', description: 'Computer tasks, cleanup, and more' },
  { id: 'ai-improvement', name: 'AI Improvement', description: 'Modify this app itself (self-improve)' },
  { id: 'learning', name: 'Learning Mode', description: 'Learn your coding style and preferences' },
  { id: 'sandbox', name: 'Sandbox', description: 'Safe experimental environment' },
  { id: 'jailbreak', name: 'Uncensored', description: 'Custom system prompts (advanced)' },
  { id: 'plugin', name: 'Plugin Mode', description: 'Manage and use custom plugins' },
];

export function ModesSidebar({
  currentMode,
  onModeChange,
  onOpenSettings,
  onCollapse,
  collapsed = false,
}: ModesSidebarProps) {
  const { isOnline } = useNetworkStatus();

  const handleModeSelect = (mode: IDEMode | 'chat') => {
    if (mode === 'chat') {
      // Chat mode uses app-builder but with a different context
      onModeChange('app-builder');
    } else {
      onModeChange(mode);
    }
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Header with branding */}
      <div className="p-4 flex items-center gap-3">
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

      {/* Modes Section */}
      <div className="px-3 pt-4 pb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          MODES
        </span>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 py-1">
          {MODES_LIST.map((mode) => {
            const isActive = mode.id === 'chat' 
              ? currentMode === 'app-builder' 
              : currentMode === mode.id;
            
            return (
              <button
                key={mode.id}
                onClick={() => handleModeSelect(mode.id)}
                className={cn(
                  'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
                )}
              >
                <div className={cn(
                  "mt-0.5",
                  isActive ? "text-accent" : "text-muted-foreground"
                )}>
                  {MODE_ICONS[mode.id]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    isActive && "text-accent"
                  )}>
                    {mode.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {mode.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        {/* Connection Status */}
        <button
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-accent" />
            ) : (
              <WifiOff className="w-5 h-5" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium">
                {isOnline ? 'Online' : 'Offline'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isOnline ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Settings */}
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
