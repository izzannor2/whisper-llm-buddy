import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Sparkles, Box, FileCode, Bug, Play, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useToast } from '@/hooks/use-toast';
import { StatusPill, StatusState } from '@/components/StatusPill';
import { StlViewer, type StlViewerInfo } from '@/components/threed/StlViewer';
import { ModelInspector } from '@/components/threed/ModelInspector';
import { AcceptanceChecklist } from '@/components/threed/AcceptanceChecklist';
import { VoiceControls } from '@/components/threed/VoiceControls';
import { ShapeToolbox } from '@/components/threed/ShapeToolbox';
import { SceneTree } from '@/components/threed/SceneTree';
import { ShapeProperties } from '@/components/threed/ShapeProperties';
import { AIModifyPanel } from '@/components/threed/AIModifyPanel';
import { ProjectsPanel } from '@/components/threed/ProjectsPanel';
import { SCAD_TEMPLATES, generateScadWithFix, validateScad, autoFixScad } from '@/lib/openscad';
import { downloadBlob, get3DStatus, getOpenScadStatus, renderStl, saveScad, savePreview, type RenderStlResult } from '@/lib/stl-export';
import {
  createNode, emptyScene, sceneToScad, SCENE_TEMPLATES, type Scene, type SceneNode, type ShapeKind,
} from '@/lib/threed-scene';

type Pipeline = 'idle' | 'editing' | 'validating' | 'rendering' | 'ready' | 'error';

const LIVE_KEY = 'threed.livePreview';
const MODE_KEY = 'threed.mode';

export default function ThreeDWorkspace() {
  const { toast } = useToast();
  const [mode, setMode] = useState<'visual' | 'code'>(() => (localStorage.getItem(MODE_KEY) as 'visual' | 'code') || 'visual');
  const [scene, setScene] = useState<Scene>(emptyScene());
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  const [projectsReload, setProjectsReload] = useState(0);

  const debounceRef = useRef<number | null>(null);
  const renderingRef = useRef(false);
  const queuedRef = useRef(false);
  const lastScreenshotRef = useRef<string | null>(null);

  const selectedNode = useMemo(() => scene.nodes.find((n) => n.id === selectedId) || null, [scene, selectedId]);

  // Persist preferences
  useEffect(() => { try { localStorage.setItem(LIVE_KEY, livePreview ? '1' : '0'); } catch {} }, [livePreview]);
  useEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch {} }, [mode]);

  useEffect(() => { void checkOpenScad(); }, []);

  // In Visual mode: serialize scene → scad whenever it changes.
  useEffect(() => {
    if (mode !== 'visual') return;
    const next = sceneToScad(scene);
    setScad(next);
  }, [scene, mode]);

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

  // Scene operations
  const addShape = (kind: ShapeKind, asHole = false) => {
    const node = createNode(kind, asHole ? 'difference' : 'union');
    setScene((s) => ({ ...s, nodes: [...s.nodes, node] }));
    setSelectedId(node.id);
    setMode('visual');
  };
  const updateNode = (id: string, patch: Partial<SceneNode>) =>
    setScene((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const deleteNode = (id: string) => {
    setScene((s) => ({ ...s, nodes: s.nodes.filter((n) => n.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateNode = (id: string) =>
    setScene((s) => {
      const idx = s.nodes.findIndex((n) => n.id === id);
      if (idx < 0) return s;
      const clone: SceneNode = { ...s.nodes[idx], id: `${s.nodes[idx].id}_copy_${Date.now().toString(36)}`, name: s.nodes[idx].name + ' copy' };
      const next = [...s.nodes];
      next.splice(idx + 1, 0, clone);
      return { ...s, nodes: next };
    });
  const moveNode = (id: string, dir: -1 | 1) =>
    setScene((s) => {
      const idx = s.nodes.findIndex((n) => n.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= s.nodes.length) return s;
      const next = [...s.nodes];
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...s, nodes: next };
    });
  const setOpForSelected = (op: SceneNode['op']) => { if (selectedId) updateNode(selectedId, { op }); };

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast({ variant: 'destructive', title: 'Enter a prompt' }); return; }
    setStatus('thinking');
    setStatusMsg('Asking AI for OpenSCAD code…');
    try {
      const result = await generateScadWithFix(prompt, 3, (s) => {
        setStatus(s);
        setStatusMsg(s === 'fixing' ? 'Validation failed, retrying…' : 'Generating OpenSCAD code…');
      });
      setMode('code'); // generated free-form code lives in the code editor
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
      toast({ variant: 'destructive', title: 'OpenSCAD CLI not found', description: 'Install OpenSCAD and ensure the local agent is running on port 3847.' });
      return;
    }
    await doRender();
  };

  const handleSaveProject = async () => {
    if (!scad) return;
    const r = await saveScad(scad, name || 'model');
    if (r.ok) {
      toast({ title: 'Project saved', description: r.scadPath || 'projects/3d/' });
      if (lastScreenshotRef.current) await savePreview(name || 'model', lastScreenshotRef.current);
      setProjectsReload((k) => k + 1);
    } else {
      toast({ variant: 'destructive', title: 'Save failed', description: r.error });
    }
  };

  const copyDebug = async () => {
    let backend: any = null;
    try { backend = await get3DStatus(); } catch {}
    const debug = {
      generatedAt: new Date().toISOString(),
      name, mode, pipeline, livePreview, stale,
      scad, scadBytes: scad.length,
      sceneNodes: scene.nodes.length,
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

  const loadSavedProject = (n: string, code: string) => {
    setName(n);
    setMode('code');
    setScad(code);
    toast({ title: `Loaded ${n}` });
  };

  const applySceneTemplate = (id: string) => {
    const t = SCENE_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setScene(t.build());
    setMode('visual');
    setSelectedId(null);
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
        <h1 className="text-sm font-semibold">3D Printing CAD</h1>
        <div className="ml-auto flex items-center gap-3">
          <VoiceControls
            onTranscript={(t) => setPrompt((p) => (p ? p + ' ' + t : t))}
            speakText={statusMsg || (scad ? 'OpenSCAD model ready.' : '')}
          />
          <StatusPill state={status} message={statusMsg} />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* LEFT: builder */}
        <ResizablePanel defaultSize={26} minSize={20}>
          <div className="h-full flex flex-col p-2 gap-2 overflow-auto">
            <ShapeToolbox onAdd={addShape} />
            <div className="flex gap-1 text-[10px]">
              <Button size="sm" variant="outline" className="h-7 flex-1 text-[10px]" onClick={() => setOpForSelected('union')} disabled={!selectedNode}>Union</Button>
              <Button size="sm" variant="outline" className="h-7 flex-1 text-[10px]" onClick={() => setOpForSelected('difference')} disabled={!selectedNode}>Cut</Button>
              <Button size="sm" variant="outline" className="h-7 flex-1 text-[10px]" onClick={() => setOpForSelected('intersection')} disabled={!selectedNode}>∩</Button>
            </div>
            <SceneTree
              nodes={scene.nodes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpdate={updateNode}
              onDuplicate={duplicateNode}
              onDelete={deleteNode}
              onMove={moveNode}
            />
            <ShapeProperties node={selectedNode} onChange={(p) => selectedId && updateNode(selectedId, p)} />
            <ProjectsPanel onLoad={loadSavedProject} reloadKey={projectsReload} />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* MIDDLE: code/AI */}
        <ResizablePanel defaultSize={36} minSize={25}>
          <div className="h-full flex flex-col p-2 gap-2 overflow-auto">
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'visual' | 'code')}>
              <TabsList className="h-8">
                <TabsTrigger value="visual" className="text-xs">Visual (Scene)</TabsTrigger>
                <TabsTrigger value="code" className="text-xs">Code (SCAD)</TabsTrigger>
              </TabsList>
              <TabsContent value="visual" className="mt-2 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Quick Templates</div>
                <div className="flex flex-wrap gap-1">
                  {SCENE_TEMPLATES.map((t) => (
                    <Button key={t.id} size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => applySceneTemplate(t.id)}>
                      {t.label}
                    </Button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Edit shapes via the left panel. The SCAD code below is auto-generated from the scene.
                </p>
              </TabsContent>
              <TabsContent value="code" className="mt-2 space-y-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">AI Prompt</label>
                  <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the part…" className="mt-1 min-h-[60px] text-xs" />
                </div>
                <div className="flex flex-wrap gap-1">
                  {SCAD_TEMPLATES.map((t) => (
                    <Button key={t.id} variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setPrompt(t.prompt)}>
                      {t.label}
                    </Button>
                  ))}
                </div>
                <Button size="sm" className="w-full h-7 text-xs" onClick={handleGenerate} disabled={status === 'thinking' || status === 'generating' || status === 'fixing'}>
                  <Sparkles className="w-3 h-3 mr-1.5" /> Generate SCAD
                </Button>
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.replace(/[^a-z0-9_-]/gi, '_'))}
                className="flex-1 h-7 px-2 rounded-md border border-input bg-background text-xs"
                placeholder="project name"
              />
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSaveProject} disabled={!scad}>
                <Save className="w-3 h-3 mr-1" />Save
              </Button>
            </div>

            <Card className="flex-1 min-h-[200px] flex flex-col overflow-hidden">
              <div className="px-2 py-1.5 border-b border-border flex items-center gap-2 flex-wrap">
                <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium">model.scad {mode === 'visual' && <span className="text-muted-foreground">(auto)</span>}</span>
                <label className="ml-2 flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                  <Switch checked={livePreview} onCheckedChange={setLivePreview} />
                  Live
                </label>
                <div className="ml-auto flex gap-0.5">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={handleManualRender} disabled={!scad || pipeline === 'rendering'}>
                    <Play className="w-3 h-3 mr-1" />Render
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => downloadBlob(scad, `${name || 'model'}.scad`, 'application/x-openscad')} disabled={!scad}>
                    <Download className="w-3 h-3 mr-1" />.scad
                  </Button>
                  {stl && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => downloadBlob(stl, `${name || 'model'}.stl`, 'application/sla')}>
                      <Download className="w-3 h-3 mr-1" />.stl
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={copyDebug}>
                    <Bug className="w-3 h-3 mr-1" />Debug
                  </Button>
                </div>
              </div>
              <Textarea
                value={scad}
                onChange={(e) => { setMode('code'); setScad(e.target.value); }}
                placeholder="// SCAD will appear here…"
                className="flex-1 font-mono text-[11px] rounded-none border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                spellCheck={false}
              />
              {validationErrors.length > 0 && (
                <div className="border-t border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive font-mono">
                  {validationErrors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
            </Card>

            <AIModifyPanel scad={scad} onResult={(s) => { setMode('code'); setScad(s); }} onStatus={setStatusMsg} />
            <AcceptanceChecklist />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT: viewer + inspector */}
        <ResizablePanel defaultSize={38} minSize={25}>
          <div className="h-full flex flex-col">
            <div className="px-3 py-1.5 border-b border-border text-[10px] font-mono flex items-center gap-3 bg-muted/30 flex-wrap">
              <span>pipeline: <span className={pipelineColor}>{pipeline}</span></span>
              {stale && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">stale preview</span>}
              {lastRender?.bytes != null && <span>stl: {(lastRender.bytes / 1024).toFixed(1)} KB</span>}
              {viewerInfo?.bbox && <span>bbox: {viewerInfo.bbox.x}×{viewerInfo.bbox.y}×{viewerInfo.bbox.z} mm</span>}
              {viewerInfo && <span>tris: {viewerInfo.triangles.toLocaleString()}</span>}
            </div>
            <div className="flex-1 min-h-0">
              {stl ? (
                <StlViewer stl={stl} onInfo={setViewerInfo} onScreenshot={(u) => { lastScreenshotRef.current = u; }} />
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

            <div className="border-t border-border p-2">
              <ModelInspector info={viewerInfo} />
            </div>

            {openScadAvailable === false && (
              <div className="border-t border-border p-2 text-[10px] text-muted-foreground">
                <p className="font-medium text-foreground mb-0.5">OpenSCAD CLI not detected.</p>
                <p>Install OpenSCAD and ensure the local agent is on port 3847. STL render and slicer-bound features (manifold check, true overhang detection) require OpenSCAD or a slicer.</p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
