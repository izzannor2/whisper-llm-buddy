import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Sparkles, Box, FileCode, Bug, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useToast } from '@/hooks/use-toast';
import { StatusPill, StatusState } from '@/components/StatusPill';
import { StlViewer, type StlViewerInfo } from '@/components/threed/StlViewer';
import { ModelInspector } from '@/components/threed/ModelInspector';
import { AcceptanceChecklist } from '@/components/threed/AcceptanceChecklist';
import { VoiceControls } from '@/components/threed/VoiceControls';
import { SCAD_TEMPLATES, generateScadWithFix, validateScad } from '@/lib/openscad';
import { downloadBlob, get3DStatus, getOpenScadStatus, renderStl, saveScad, type RenderStlResult } from '@/lib/stl-export';

type Pipeline = 'idle' | 'editing' | 'validating' | 'rendering' | 'ready' | 'error';

const LIVE_KEY = 'threed.livePreview';

export default function ThreeDWorkspace() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [scad, setScad] = useState('');
  const [stl, setStl] = useState<ArrayBuffer | null>(null);
  const [status, setStatus] = useState<StatusState>('idle');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [openScadAvailable, setOpenScadAvailable] = useState<boolean | null>(null);
  const [name, setName] = useState('model');
  const [viewerInfo, setViewerInfo] = useState<StlViewerInfo | null>(null);
  const [lastRender, setLastRender] = useState<RenderStlResult | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline>('idle');
  const [stale, setStale] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [renderError, setRenderError] = useState<{ stderr?: string | null; line?: number | null; message: string } | null>(null);
  const [livePreview, setLivePreview] = useState<boolean>(() => {
    try { return localStorage.getItem(LIVE_KEY) !== '0'; } catch { return true; }
  });

  const debounceRef = useRef<number | null>(null);
  const renderingRef = useRef(false);
  const queuedRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(LIVE_KEY, livePreview ? '1' : '0'); } catch {}
  }, [livePreview]);

  useEffect(() => { void checkOpenScad(); }, []);

  const checkOpenScad = async () => {
    const s = await getOpenScadStatus();
    setOpenScadAvailable(s.available);
    return s.available;
  };

  const doRender = async () => {
    if (!scad.trim()) return;
    if (renderingRef.current) { queuedRef.current = true; return; }
    renderingRef.current = true;
    setPipeline('validating');
    const v = validateScad(scad);
    setValidationErrors(v.errors);
    if (!v.ok) {
      setPipeline('error');
      setStale(stl !== null);
      renderingRef.current = false;
      return;
    }
    setPipeline('rendering');
    setRenderError(null);
    const r = await renderStl(scad, name || 'model');
    setLastRender(r);
    if (!r.ok || !r.stl || r.stl.byteLength <= 100) {
      const stderr = r.stderr || '';
      const lineMatch = stderr.match(/line[:\s]+(\d+)/i);
      setRenderError({
        stderr,
        line: lineMatch ? parseInt(lineMatch[1], 10) : null,
        message: r.error || 'Render failed',
      });
      setPipeline('error');
      setStale(stl !== null);
    } else {
      setStl(r.stl);
      setStale(false);
      setPipeline('ready');
      const kb = (r.stl.byteLength / 1024).toFixed(1);
      setStatusMsg(`STL rendered: ${kb} KB`);
    }
    renderingRef.current = false;
    if (queuedRef.current) {
      queuedRef.current = false;
      setTimeout(() => void doRender(), 50);
    }
  };

  // Debounced auto-render on SCAD change
  useEffect(() => {
    if (!scad.trim()) return;
    setPipeline('editing');
    if (!livePreview) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { void doRender(); }, 1500);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [scad, livePreview]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', title: 'Enter a prompt' });
      return;
    }
    setStatus('thinking');
    setStatusMsg('Asking AI for OpenSCAD code…');
    try {
      const result = await generateScadWithFix(prompt, 3, (s) => {
        setStatus(s);
        setStatusMsg(s === 'fixing' ? 'Validation failed, retrying…' : 'Generating OpenSCAD code…');
      });
      setScad(result.code);
      if (result.errors.length) {
        setStatus('error');
        setStatusMsg(`Generated with issues after ${result.attempts} tries: ${result.errors.join('; ')}`);
      } else {
        setStatus('done');
        setStatusMsg(`Generated in ${result.attempts} attempt${result.attempts > 1 ? 's' : ''}.`);
      }
    } catch (e) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message : 'Generation failed');
    }
  };

  const handleManualRender = async () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!(openScadAvailable ?? (await checkOpenScad()))) {
      toast({
        variant: 'destructive',
        title: 'OpenSCAD CLI not found',
        description: 'Install OpenSCAD and ensure the local agent is running on port 3847.',
      });
      return;
    }
    await doRender();
  };

  const handleSaveScad = async () => {
    if (!scad) return;
    const r = await saveScad(scad, name || 'model');
    if (r.ok) toast({ title: 'Saved', description: r.scadPath || 'projects/3d/' });
    else toast({ variant: 'destructive', title: 'Save failed', description: r.error });
  };

  const copyDebug = async () => {
    let backend: any = null;
    try { backend = await get3DStatus(); } catch {}
    const debug = {
      generatedAt: new Date().toISOString(),
      name,
      pipeline,
      livePreview,
      stale,
      scad,
      scadBytes: scad.length,
      validationErrors,
      stlBytes: lastRender?.bytes ?? null,
      contentType: lastRender?.contentType ?? null,
      stlPath: lastRender?.stlPath ?? null,
      openscadStderr: lastRender?.stderr ?? null,
      renderError,
      viewer: viewerInfo,
      backend,
    };
    await navigator.clipboard.writeText(JSON.stringify(debug, null, 2));
    toast({ title: '3D debug copied' });
  };

  const pipelineColor =
    pipeline === 'ready' ? 'text-green-500' :
    pipeline === 'error' ? 'text-destructive' :
    pipeline === 'rendering' ? 'text-amber-400' :
    pipeline === 'validating' ? 'text-blue-400' :
    pipeline === 'editing' ? 'text-muted-foreground' : 'text-muted-foreground';

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground">
      <header className="h-12 px-4 flex items-center gap-3 border-b border-border">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <Box className="w-5 h-5 text-accent" />
        <h1 className="text-sm font-semibold">3D Printing</h1>
        <div className="ml-auto flex items-center gap-3">
          <VoiceControls
            onTranscript={(t) => setPrompt((p) => (p ? p + ' ' + t : t))}
            speakText={statusMsg || (scad ? 'OpenSCAD model ready.' : '')}
          />
          <StatusPill state={status} message={statusMsg} />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={45} minSize={30}>
          <div className="h-full flex flex-col p-4 gap-3 overflow-auto">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Prompt</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the part you want to print…"
                className="mt-1 min-h-[80px] text-sm"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Templates</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SCAD_TEMPLATES.map((t) => (
                  <Button key={t.id} variant="outline" size="sm" onClick={() => setPrompt(t.prompt)}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.replace(/[^a-z0-9_-]/gi, '_'))}
                className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm"
                placeholder="model name"
              />
              <Button onClick={handleGenerate} disabled={status === 'thinking' || status === 'generating' || status === 'fixing'}>
                <Sparkles className="w-4 h-4 mr-2" /> Generate
              </Button>
            </div>

            <Card className="flex-1 min-h-[280px] flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap">
                <FileCode className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium">model.scad</span>
                <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Switch checked={livePreview} onCheckedChange={setLivePreview} />
                  Live Preview
                </label>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={handleManualRender} disabled={!scad || pipeline === 'rendering'}>
                    <Play className="w-3.5 h-3.5 mr-1.5" />Render
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleSaveScad} disabled={!scad}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadBlob(scad, `${name || 'model'}.scad`, 'application/x-openscad')} disabled={!scad}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />.scad
                  </Button>
                  {stl && (
                    <Button size="sm" variant="ghost" onClick={() => downloadBlob(stl, `${name || 'model'}.stl`, 'application/sla')}>
                      <Download className="w-3.5 h-3.5 mr-1.5" />.stl
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={copyDebug}>
                    <Bug className="w-3.5 h-3.5 mr-1.5" />Debug
                  </Button>
                </div>
              </div>
              <Textarea
                value={scad}
                onChange={(e) => setScad(e.target.value)}
                placeholder="// Generated OpenSCAD will appear here, or write your own…"
                className="flex-1 font-mono text-xs rounded-none border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                spellCheck={false}
              />
              {validationErrors.length > 0 && (
                <div className="border-t border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive font-mono">
                  {validationErrors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
            </Card>

            <AcceptanceChecklist />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={55} minSize={30}>
          <div className="h-full flex flex-col">
            <div className="px-3 py-1.5 border-b border-border text-[11px] font-mono flex items-center gap-3 bg-muted/30 flex-wrap">
              <span>pipeline: <span className={pipelineColor}>{pipeline}</span></span>
              {stale && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">stale preview</span>}
              {lastRender?.bytes != null && <span>stl: {(lastRender.bytes / 1024).toFixed(1)} KB</span>}
              {viewerInfo && <span>verts: {viewerInfo.vertices.toLocaleString()}</span>}
              {viewerInfo && <span>tris: {viewerInfo.triangles.toLocaleString()}</span>}
            </div>
            <div className="flex-1 min-h-0">
              {stl ? (
                <StlViewer stl={stl} onInfo={setViewerInfo} />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  {pipeline === 'rendering' ? 'Rendering…' : 'Edit SCAD or click Render to preview.'}
                </div>
              )}
            </div>

            {renderError && (
              <div className="border-t border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive font-mono space-y-1">
                <div className="font-semibold">Render failed: {renderError.message}</div>
                {renderError.line != null && <div>at SCAD line {renderError.line}</div>}
                {renderError.stderr && (
                  <pre className="whitespace-pre-wrap max-h-32 overflow-auto opacity-80">{renderError.stderr}</pre>
                )}
                {stl && <div className="text-muted-foreground">Last successful preview retained.</div>}
              </div>
            )}

            <div className="border-t border-border p-3">
              <ModelInspector info={viewerInfo} />
            </div>

            {openScadAvailable === false && (
              <div className="border-t border-border p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">OpenSCAD CLI not detected.</p>
                <p>Install OpenSCAD to enable STL rendering, then ensure the local agent is on port 3847.</p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
