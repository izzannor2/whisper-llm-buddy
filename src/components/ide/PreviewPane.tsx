import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { RefreshCw, ExternalLink, Terminal, Play, Square, Maximize2, Minimize2, Eye, Smartphone, Tablet, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type DeviceSize = 'mobile' | 'tablet' | 'desktop';

const DEVICE_SIZES: Record<DeviceSize, { width: number; height: number; label: string }> = {
  mobile: { width: 375, height: 812, label: '375×812' },
  tablet: { width: 768, height: 1024, label: '768×1024' },
  desktop: { width: 0, height: 0, label: 'Full width' }, // 0 = fill container
};

interface PreviewPaneProps {
  previewUrl?: string;
  previewBlobUrl?: string;
  isServerRunning: boolean;
  logs: string[];
  errors: string[];
  onRefresh: () => void;
  onStartServer: () => void;
  onStopServer: () => void;
  onOpenExternal?: () => void;
  onGeneratePreview?: () => void;
  className?: string;
}

export const PreviewPane = React.forwardRef<HTMLDivElement, PreviewPaneProps>(({
  previewUrl,
  previewBlobUrl,
  isServerRunning,
  logs,
  errors,
  onRefresh,
  onStartServer,
  onStopServer,
  onOpenExternal,
  onGeneratePreview,
  className,
}, ref) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'console'>('preview');
  const [isMaximized, setIsMaximized] = useState(false);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const displayUrl = isServerRunning && previewUrl ? previewUrl : previewBlobUrl;

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, errors]);

  const handleRefresh = () => {
    if (iframeRef.current && displayUrl) {
      iframeRef.current.src = displayUrl;
    }
    onRefresh();
  };

  const device = DEVICE_SIZES[deviceSize];
  const isResponsive = deviceSize !== 'desktop';

  return (
    <div ref={ref} className={cn('flex flex-col h-full bg-card', isMaximized && 'fixed inset-0 z-50', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'preview' | 'console')}>
            <TabsList className="h-7">
              <TabsTrigger value="preview" className="text-xs px-2 py-1">Preview</TabsTrigger>
              <TabsTrigger value="console" className="text-xs px-2 py-1">
                Console
                {errors.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">
                    {errors.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-1">
          {/* Device size toggles */}
          <div className="flex items-center border border-border rounded-md overflow-hidden mr-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'h-7 w-7 flex items-center justify-center transition-colors',
                    deviceSize === 'mobile' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setDeviceSize('mobile')}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Mobile (375×812)</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'h-7 w-7 flex items-center justify-center transition-colors border-x border-border',
                    deviceSize === 'tablet' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setDeviceSize('tablet')}
                >
                  <Tablet className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Tablet (768×1024)</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'h-7 w-7 flex items-center justify-center transition-colors',
                    deviceSize === 'desktop' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setDeviceSize('desktop')}
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Desktop (full width)</p></TooltipContent>
            </Tooltip>
          </div>

          {onGeneratePreview && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onGeneratePreview} title="Generate Preview">
              <Eye className="h-4 w-4 text-primary" />
            </Button>
          )}
          {displayUrl && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          {isServerRunning ? (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStopServer}>
              <Square className="h-4 w-4 text-destructive" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartServer} title="Start Dev Server">
              <Play className="h-4 w-4 text-accent" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onOpenExternal}>
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMaximized(!isMaximized)}>
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'preview' ? (
          <div className={cn(
            'h-full',
            isResponsive ? 'flex items-start justify-center overflow-auto bg-muted/30 p-4' : ''
          )}>
            {displayUrl ? (
              isResponsive ? (
                <div
                  className="bg-background rounded-lg shadow-2xl border border-border overflow-hidden flex-shrink-0 transition-all duration-300"
                  style={{ width: device.width, height: device.height, maxHeight: '100%' }}
                >
                  <iframe
                    ref={iframeRef}
                    src={displayUrl}
                    className="w-full h-full border-0"
                    title="Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                </div>
              ) : (
                <div className="h-full bg-background">
                  <iframe
                    ref={iframeRef}
                    src={displayUrl}
                    className="w-full h-full border-0"
                    title="Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-muted/40 to-muted/20 text-muted-foreground p-6">
                <div className="text-center max-w-md">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Eye className="h-10 w-10 text-primary/60" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">Preview Your App</h3>
                  <p className="text-sm mb-6 leading-relaxed text-muted-foreground">
                    Ask the AI to build something, then click the <strong>eye icon</strong> above to generate an instant preview — no dev server needed.
                  </p>
                  <div className="flex flex-col gap-3">
                    {onGeneratePreview && (
                      <Button variant="default" size="lg" onClick={onGeneratePreview} className="gap-2">
                        <Eye className="h-4 w-4" />
                        Generate Preview
                      </Button>
                    )}
                    <Button variant="outline" size="lg" onClick={onStartServer} className="gap-2">
                      <Play className="h-4 w-4" />
                      Start Dev Server
                    </Button>
                  </div>
                  <div className="mt-6 p-4 rounded-lg bg-muted/50 text-left">
                    <p className="text-xs font-medium mb-2 text-foreground/80">💡 Two ways to preview:</p>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      <li><strong>Instant Preview</strong> — Renders your code right here</li>
                      <li><strong>Dev Server</strong> — Full live reload via LocalDev Agent</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div ref={consoleRef} className="p-3 font-mono text-xs space-y-1">
              {logs.length === 0 && errors.length === 0 ? (
                <div className="text-muted-foreground">No console output yet...</div>
              ) : (
                <>
                  {logs.map((log, i) => (
                    <div key={`log-${i}`} className="text-muted-foreground">
                      <span className="text-accent">[info]</span> {log}
                    </div>
                  ))}
                  {errors.map((error, i) => (
                    <div key={`error-${i}`} className="text-destructive">
                      <span className="text-destructive">[error]</span> {error}
                    </div>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border text-xs text-muted-foreground bg-card">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', displayUrl ? 'bg-accent' : 'bg-muted')} />
          <span>{isServerRunning ? 'Server running' : previewBlobUrl ? 'Instant preview' : 'No preview'}</span>
        </div>
        <div className="flex items-center gap-2">
          {isResponsive && <span className="font-mono">{device.label}</span>}
          {isServerRunning && previewUrl && <span className="font-mono">{previewUrl}</span>}
        </div>
      </div>
    </div>
  );
});

PreviewPane.displayName = 'PreviewPane';
