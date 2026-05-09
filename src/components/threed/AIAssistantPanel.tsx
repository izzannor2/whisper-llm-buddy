import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Wand2 } from 'lucide-react';
import { sendChatMessage, loadSettings } from '@/lib/chat-api';
import { resolveModelSync } from '@/lib/model-routing';
import { getCachedRegistry } from '@/lib/model-registry';
import { toast } from 'sonner';
import type { Scene, SceneNode } from '@/lib/threed-scene';
import type { PrinterConstraints } from './PrinterConstraintsPanel';

export type AssistantState = 'idle' | 'thinking' | 'updating' | 'ready' | 'error';

interface Props {
  scad: string;
  scene: Scene;
  selected: SceneNode | null;
  bbox: { x: number; y: number; z: number } | null;
  referenceImage: string | null;
  sketchImage: string | null;
  printer: PrinterConstraints;
  onResultScad: (newScad: string) => void;
  onState: (s: AssistantState, msg?: string) => void;
}

const QUICK = [
  'Generate a new model from the prompt',
  'Modify the selected part',
  'Improve printability',
  'Make stronger',
  'Add mounting holes',
  'Optimize for 3D printing',
];

const SYS = `You are an OpenSCAD CAD assistant. The user gives you the existing OpenSCAD file plus context (scene tree JSON, selected part, dimensions, printer constraints, optional reference images).
Modify ONLY what the user asks. Preserve the rest of the model.
Return ONLY the full updated OpenSCAD file — no markdown fences, no commentary. If a reference image is provided, use it as design guidance but produce editable CAD primitives.`;

export function AIAssistantPanel(props: Props) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (userText: string) => {
    if (!userText.trim()) { props.onState('error', 'Empty prompt.'); return; }
    setBusy(true);
    props.onState('thinking', 'Asking AI…');
    try {
      const settings = loadSettings();
      const sceneJson = JSON.stringify({
        nodes: props.scene.nodes.map((n) => ({ id: n.id, name: n.name, kind: n.kind, op: n.op, pos: n.pos, rot: n.rot, scale: n.scale, params: n.params })),
        fn: props.scene.fn,
      });
      const ctx = [
        `EXISTING OPENSCAD:\n${props.scad || '// (none)'}\n`,
        `SCENE TREE JSON:\n${sceneJson}\n`,
        props.selected ? `SELECTED PART: ${props.selected.name} [${props.selected.kind}] id=${props.selected.id}\n` : '',
        props.bbox ? `BOUNDING BOX (mm): ${props.bbox.x} × ${props.bbox.y} × ${props.bbox.z}\n` : '',
        `PRINTER: bed=${props.printer.bedX}×${props.printer.bedY}×${props.printer.bedZ}mm, nozzle=${props.printer.nozzle}mm, layer=${props.printer.layerHeight}mm, minWall=${props.printer.minWall}mm, filament=${props.printer.filament}\n`,
        props.referenceImage ? `REFERENCE IMAGE: attached (data URL)\n` : '',
        props.sketchImage ? `SKETCH REFERENCE: attached (data URL)\n` : '',
        `USER REQUEST: ${userText}`,
      ].join('');

      const userMsg: any = { role: 'user', content: ctx };
      // If we have images and the model supports it, attach as multimodal — chat-api may pass through.
      const images: string[] = [];
      if (props.referenceImage) images.push(props.referenceImage);
      if (props.sketchImage) images.push(props.sketchImage);
      if (images.length) (userMsg as any).images = images;

      props.onState('updating', 'Updating model…');
      const reply = await sendChatMessage(
        [{ role: 'system', content: SYS }, userMsg],
        settings,
        undefined,
        { role: '3d-printing' } as any,
      );
      const cleaned = (reply || '').replace(/```(?:openscad|scad)?\s*/gi, '').replace(/```/g, '').trim();
      if (!cleaned) {
        props.onState('error', 'AI returned no code.');
      } else {
        props.onResultScad(cleaned);
        props.onState('ready', 'AI applied changes.');
      }
    } catch (e) {
      props.onState('error', e instanceof Error ? e.message : 'AI failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border rounded-md bg-muted/20 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <Wand2 className="w-3.5 h-3.5 text-accent" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI Design Assistant</div>
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder='e.g. "Make the wall 3mm and add four M3 screw holes near the corners"'
        className="text-xs min-h-[60px]"
      />
      <div className="flex flex-wrap gap-1">
        {QUICK.map((q) => (
          <Button key={q} size="sm" variant="outline" className="h-6 text-[10px] px-2"
            onClick={() => void run(q)} disabled={busy}>
            {q}
          </Button>
        ))}
      </div>
      <Button size="sm" className="w-full h-7 text-xs" onClick={() => void run(prompt)} disabled={busy || !prompt.trim()}>
        <Sparkles className="w-3 h-3 mr-1.5" />{busy ? 'Working…' : 'Run AI'}
      </Button>
      <p className="text-[9px] text-muted-foreground leading-snug">
        Context sent: full SCAD, scene tree, selected part, bbox, printer constraints, reference image/sketch (if attached).
        Output remains editable CAD/OpenSCAD primitives.
      </p>
    </div>
  );
}
