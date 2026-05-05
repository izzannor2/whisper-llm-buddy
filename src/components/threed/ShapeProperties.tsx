import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SHAPE_DEFS, type SceneNode, type Op } from '@/lib/threed-scene';

interface Props {
  node: SceneNode | null;
  onChange: (patch: Partial<SceneNode>) => void;
}

export function ShapeProperties({ node, onChange }: Props) {
  if (!node) return <div className="text-xs text-muted-foreground p-3 italic">Select a shape to edit its parameters.</div>;
  const def = SHAPE_DEFS[node.kind];

  const setParam = (k: string, v: string) => {
    const field = def.fields.find((f) => f.key === k);
    const value = field?.type === 'number' ? (parseFloat(v) || 0) : v;
    onChange({ params: { ...node.params, [k]: value } });
  };
  const setPos = (axis: 'x' | 'y' | 'z', v: string) => onChange({ pos: { ...node.pos, [axis]: parseFloat(v) || 0 } });
  const setRot = (axis: 'x' | 'y' | 'z', v: string) => onChange({ rot: { ...node.rot, [axis]: parseFloat(v) || 0 } });
  const setScale = (axis: 'x' | 'y' | 'z', v: string) => onChange({ scale: { ...(node.scale ?? { x: 1, y: 1, z: 1 }), [axis]: parseFloat(v) || 1 } });
  const sc = node.scale ?? { x: 1, y: 1, z: 1 };

  return (
    <div className="border border-border rounded-md bg-muted/20 p-2 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{def.label} — Properties</div>

      <div className="grid grid-cols-[80px_1fr] gap-1.5 items-center text-xs">
        <Label className="text-xs">Boolean</Label>
        <Select value={node.op} onValueChange={(v) => onChange({ op: v as Op })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="union">Union (add)</SelectItem>
            <SelectItem value="difference">Difference (cut / hole)</SelectItem>
            <SelectItem value="intersection">Intersection</SelectItem>
          </SelectContent>
        </Select>

        {def.fields.map((f) => (
          <FieldRow key={f.key} label={f.label} value={String(node.params[f.key] ?? '')} type={f.type} step={f.step} onChange={(v) => setParam(f.key, v)} />
        ))}

        <Label className="text-xs col-span-2 mt-1 text-muted-foreground">Position (mm)</Label>
        {(['x', 'y', 'z'] as const).map((a) => (
          <FieldRow key={`p${a}`} label={`Pos ${a.toUpperCase()}`} value={String(node.pos[a])} type="number" step={0.5} onChange={(v) => setPos(a, v)} />
        ))}

        <Label className="text-xs col-span-2 mt-1 text-muted-foreground">Rotation (deg)</Label>
        {(['x', 'y', 'z'] as const).map((a) => (
          <FieldRow key={`r${a}`} label={`Rot ${a.toUpperCase()}`} value={String(node.rot[a])} type="number" step={5} onChange={(v) => setRot(a, v)} />
        ))}

        <Label className="text-xs col-span-2 mt-1 text-muted-foreground">Scale</Label>
        {(['x', 'y', 'z'] as const).map((a) => (
          <FieldRow key={`s${a}`} label={`Scale ${a.toUpperCase()}`} value={String(sc[a])} type="number" step={0.1} onChange={(v) => setScale(a, v)} />
        ))}
      </div>
    </div>
  );
}
      </div>
    </div>
  );
}

function FieldRow({ label, value, type, step, onChange }: { label: string; value: string; type: 'number' | 'text'; step?: number; onChange: (v: string) => void }) {
  return (
    <>
      <Label className="text-xs truncate">{label}</Label>
      <Input
        type={type}
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs"
      />
    </>
  );
}
