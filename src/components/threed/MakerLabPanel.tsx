import { useMemo, useState } from 'react';
import { Sparkles, Wand2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MAKERLAB_GENERATORS, defaultParams, type MakerLabGenerator } from '@/lib/makerlab';
import type { Scene } from '@/lib/threed-scene';

interface Props {
  onApply: (scene: Scene, name: string) => void;
}

const CATEGORY_LABEL: Record<MakerLabGenerator['category'], string> = {
  utility: 'Utility',
  enclosure: 'Enclosure',
  mechanical: 'Mechanical',
  decorative: 'Decorative',
  reference: 'Reference',
};

export function MakerLabPanel({ onApply }: Props) {
  const [activeId, setActiveId] = useState<string>(MAKERLAB_GENERATORS[0].id);
  const active = useMemo(() => MAKERLAB_GENERATORS.find((g) => g.id === activeId)!, [activeId]);
  const [params, setParams] = useState<Record<string, number | string>>(() => defaultParams(active));

  const setActive = (id: string) => {
    const g = MAKERLAB_GENERATORS.find((x) => x.id === id);
    if (!g) return;
    setActiveId(id);
    setParams(defaultParams(g));
  };

  const insert = () => {
    const built = active.build(params);
    onApply(built, active.id);
  };

  const grouped = useMemo(() => {
    const m = new Map<string, MakerLabGenerator[]>();
    for (const g of MAKERLAB_GENERATORS) {
      const arr = m.get(g.category) || [];
      arr.push(g);
      m.set(g.category, arr);
    }
    return m;
  }, []);
  const cats = Array.from(grouped.keys());

  return (
    <div className="border border-border rounded-md bg-muted/20 p-2 space-y-2">
      <div className="flex items-center gap-1.5">
        <Wand2 className="w-3.5 h-3.5 text-accent" />
        <span className="text-[11px] font-semibold">MakerLab Generators</span>
      </div>
      <Tabs defaultValue={cats[0]}>
        <TabsList className="h-7 flex-wrap">
          {cats.map((c) => (
            <TabsTrigger key={c} value={c} className="text-[10px] h-6 px-2">
              {CATEGORY_LABEL[c as MakerLabGenerator['category']]}
            </TabsTrigger>
          ))}
        </TabsList>
        {cats.map((c) => (
          <TabsContent key={c} value={c} className="mt-1.5">
            <div className="grid grid-cols-2 gap-1">
              {(grouped.get(c) || []).map((g) => (
                <Button
                  key={g.id}
                  size="sm"
                  variant={g.id === activeId ? 'default' : 'outline'}
                  className="h-7 text-[10px] justify-start truncate"
                  onClick={() => setActive(g.id)}
                  title={g.description}
                >
                  {g.label}
                </Button>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="space-y-1.5 border-t border-border pt-2">
        <div className="text-[10px] text-muted-foreground leading-snug">{active.description}</div>
        {active.guidanceOnly && (
          <div className="flex items-start gap-1.5 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-1">
            <AlertTriangle className="w-3 h-3 mt-0.5" />
            <span>{active.guidanceNote || 'This generator produces a placeholder; refine via the AI Generate panel.'}</span>
          </div>
        )}
        {active.fields.map((f) => (
          <div key={f.key} className="flex items-center gap-1.5">
            <Label className="text-[10px] flex-1 truncate">{f.label}</Label>
            <Input
              type={f.kind === 'number' ? 'number' : 'text'}
              step={f.step}
              value={String(params[f.key] ?? f.default)}
              onChange={(e) => {
                const v = f.kind === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value;
                setParams((p) => ({ ...p, [f.key]: v }));
              }}
              className="h-6 text-[10px] w-24"
            />
          </div>
        ))}
        <Button size="sm" className="w-full h-7 text-[11px]" onClick={insert}>
          <Sparkles className="w-3 h-3 mr-1" /> Insert into scene
        </Button>
      </div>
    </div>
  );
}
