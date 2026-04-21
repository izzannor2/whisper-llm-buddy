import { useState, useRef, useEffect, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { RefreshCw, ExternalLink, Terminal, Play, Square, Maximize2, Minimize2, Eye, Smartphone, Tablet, Monitor, RotateCcw, Loader2, Copy } from 'lucide-react';
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
  desktop: { width: 0, height: 0, label: 'Full width' },
};

interface PreviewPaneProps {
  previewUrl?: string;
  previewHtml?: string;
  previewBlobUrl?: string;
  isServerRunning: boolean;
  isGenerating?: boolean;
  logs: string[];
  errors: string[];
  agentConnected?: boolean;
  onRefresh: () => void;
  onStartServer: () => void;
  onStopServer: () => void;
  onOpenExternal?: () => void;
  onGeneratePreview?: () => void;
  className?: string;
}

export const PreviewPane = forwardRef<HTMLDivElement, PreviewPaneProps>(({
  previewUrl,
  previewHtml,
  previewBlobUrl,
  isServerRunning,
  isGenerating,
  logs,
  errors,
  agentConnected,
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
  const [isLandscape, setIsLandscape] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [timeSinceUpdate, setTimeSinceUpdate] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Use server URL when running, otherwise srcdoc (previewHtml) or blob URL fallback
  const useServerUrl = isServerRunning && previewUrl;
  const hasSrcdoc = !useServerUrl && !!previewHtml;
  const displayUrl = useServerUrl ? previewUrl : (!previewHtml ? previewBlobUrl : undefined);
  const hasPreview = !!(useServerUrl || previewHtml || previewBlobUrl);

  // Track last updated timestamp
  useEffect(() => {
    if (previewHtml || previewBlobUrl) {
      setLastUpdated(Date.now());
    }
  }, [previewHtml, previewBlobUrl]);

  // Update "X seconds ago" timer
  useEffect(() => {
    if (!lastUpdated) return;
    const update = () => {
      const seconds = Math.floor((Date.now() - lastUpdated) / 1000);
      if (seconds < 5) setTimeSinceUpdate('just now');
      else if (seconds < 60) setTimeSinceUpdate(`${seconds}s ago`);
      else setTimeSinceUpdate(`${Math.floor(seconds / 60)}m ago`);
    };
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, errors]);

  const handleRefresh = () => {
    if (iframeRef.current) {
      if (hasSrcdoc && previewHtml) {
        // Re-set srcdoc to force reload without white flash
        iframeRef.current.srcdoc = previewHtml;
      } else if (displayUrl) {
        iframeRef.current.src = displayUrl;
      }
    }
    onRefresh();
  };

  const baseDevice = DEVICE_SIZES[deviceSize];
  const device = isLandscape && deviceSize !== 'desktop'
    ? { width: baseDevice.height, height: baseDevice.width, label: `${baseDevice.height}×${baseDevice.width}` }
    : baseDevice;
  const isResponsive = deviceSize !== 'desktop';

  const renderIframe = () => {
    const commonProps = {
      ref: iframeRef,
      className: 'w-full h-full border-0',
      title: 'Preview',
      sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals',
    };

    if (hasSrcdoc && previewHtml) {
      return <iframe {...commonProps} srcDoc={previewHtml} />;
    }
    if (displayUrl) {
      return <iframe {...commonProps} src={displayUrl} />;
    }
    return null;
  };

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
          {isResponsive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'h-7 w-7 flex items-center justify-center rounded-md border border-border transition-colors',
                    isLandscape ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setIsLandscape(!isLandscape)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>{isLandscape ? 'Portrait' : 'Landscape'}</p></TooltipContent>
            </Tooltip>
          )}

          {onGeneratePreview && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onGeneratePreview} title="Generate Preview" disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
            </Button>
          )}
          {hasPreview && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          {isServerRunning ? (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStopServer}>
              <Square className="h-4 w-4 text-destructive" />
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onStartServer}
                    disabled={agentConnected === false}
                    title={agentConnected === false ? 'Local agent offline (port 3847)' : 'Start Dev Server'}
                  >
                    <Play className={cn('h-4 w-4', agentConnected === false ? 'text-muted-foreground' : 'text-accent')} />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{agentConnected === false ? 'Local agent offline (port 3847)' : 'Start Dev Server'}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {onOpenExternal && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onOpenExternal} title="Open preview in new tab">
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMaximized(!isMaximized)}>
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative">
        {/* Loading overlay */}
        {isGenerating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Generating preview…</span>
            </div>
          </div>
        )}

        {activeTab === 'preview' ? (
          <div className={cn(
            'h-full',
            isResponsive ? 'flex items-start justify-center overflow-auto bg-muted/30 p-4' : ''
          )}>
            {hasPreview ? (
              isResponsive ? (
                <div
                  className="bg-background rounded-lg shadow-2xl border border-border overflow-hidden flex-shrink-0 transition-all duration-300"
                  style={{ width: device.width, height: device.height, maxHeight: '100%' }}
                >
                  {renderIframe()}
                </div>
              ) : (
                <div className="h-full bg-background">
                  {renderIframe()}
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
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={onStartServer}
                      disabled={agentConnected === false}
                      className="gap-2"
                      title={agentConnected === false ? 'Requires LocalDev Agent on port 3847' : 'Start Dev Server'}
                    >
                      <Play className="h-4 w-4" />
                      Start Dev Server
                      {agentConnected === false && (
                        <span className="text-[10px] text-muted-foreground ml-1">(Agent offline)</span>
                      )}
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
          <span className={cn('w-2 h-2 rounded-full', hasPreview ? 'bg-accent' : 'bg-muted')} />
          <span>{isServerRunning ? 'Server running' : hasPreview ? 'Instant preview' : 'No preview'}</span>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && timeSinceUpdate && <span>Updated {timeSinceUpdate}</span>}
          {isResponsive && <span className="font-mono">{device.label}</span>}
          {isServerRunning && previewUrl && <span className="font-mono">{previewUrl}</span>}
        </div>
      </div>
    </div>
  );
});

PreviewPane.displayName = 'PreviewPane';
