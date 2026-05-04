import { useState } from 'react';
import { ArrowLeft, Download, Sparkles, Box, FileCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { StatusPill, StatusState } from '@/components/StatusPill';
import { StlViewer } from '@/components/threed/StlViewer';
import { AcceptanceChecklist } from '@/components/threed/AcceptanceChecklist';
import { SCAD_TEMPLATES, generateScadWithFix, validateScad } from '@/lib/openscad';
import { downloadBlob, getOpenScadStatus, renderStl } from '@/lib/stl-export';

export default function ThreeDWorkspace() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [scad, setScad] = useState('');
  const [stl, setStl] = useState<ArrayBuffer | null>(null);
  const [status, setStatus] = useState<StatusState>('idle');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [openScadAvailable, setOpenScadAvailable] = useState<boolean | null>(null);
  const [name, setName] = useState('model');

  const checkOpenScad = async () => {
    const s = await getOpenScadStatus();
    setOpenScadAvailable(s.available);
    return s.available;
  };

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
      setStl(null);
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

  const handleTemplate = (p: string) => {
    setPrompt(p);
  };

  const handleDownloadScad = () => {
    if (!scad) return;
    downloadBlob(scad, `${name || 'model'}.scad`, 'application/x-openscad');
  };

  const handleExportStl = async () => {
    if (!scad) return;
    const ok = openScadAvailable ?? (await checkOpenScad());
    if (!ok) {
      toast({
        variant: 'destructive',
        title: 'OpenSCAD CLI not found',
        description: 'Install OpenSCAD and ensure the local agent is running on port 3847. See instructions below.',
      });
      return;
    }
    setStatus('generating');
    setStatusMsg('Rendering STL via OpenSCAD…');
    const v = validateScad(scad);
    if (!v.ok) {
      setStatus('error');
      setStatusMsg(v.errors.join('; '));
      return;
    }
    const r = await renderStl(scad, name || 'model');
    if (!r.ok || !r.stl) {
      setStatus('error');
      setStatusMsg(r.error || 'Render failed');
      return;
    }
    setStl(r.stl);
    setStatus('done');
    setStatusMsg('STL rendered.');
    downloadBlob(r.stl, `${name || 'model'}.stl`, 'application/sla');
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground">
      <header className="h-12 px-4 flex items-center gap-3 border-b border-border">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <Box className="w-5 h-5 text-accent" />
        <h1 className="text-sm font-semibold">3D Printing</h1>
        <div className="ml-auto"><StatusPill state={status} message={statusMsg} /></div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={40} minSize={28}>
          <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Prompt</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the part you want to print…"
                className="mt-1 min-h-[120px] text-sm"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Templates</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SCAD_TEMPLATES.map((t) => (
                  <Button key={t.id} variant="outline" size="sm" onClick={() => handleTemplate(t.prompt)}>
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

            <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                <FileCode className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium">model.scad</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="ghost" onClick={handleDownloadScad} disabled={!scad}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />.scad
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleExportStl} disabled={!scad}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />.stl
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <pre className="text-xs p-3 whitespace-pre-wrap font-mono">{scad || '// Generated OpenSCAD will appear here'}</pre>
              </ScrollArea>
            </Card>

            <AcceptanceChecklist />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={60} minSize={30}>
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              {stl ? (
                <StlViewer stl={stl} />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Generate a model and export STL to preview here.
                </div>
              )}
            </div>
            {openScadAvailable === false && (
              <div className="border-t border-border p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">OpenSCAD CLI not detected.</p>
                <p>Install OpenSCAD to enable STL export:</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li>Windows: <code className="text-accent">winget install OpenSCAD.OpenSCAD</code></li>
                  <li>macOS: <code className="text-accent">brew install --cask openscad</code></li>
                  <li>Linux: <code className="text-accent">sudo apt install openscad</code></li>
                </ul>
                <p className="mt-1">Then ensure the local agent is running on port 3847.</p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
