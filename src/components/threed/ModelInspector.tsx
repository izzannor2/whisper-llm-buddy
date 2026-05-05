import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { StlViewerInfo } from './StlViewer';

interface Props {
  info: StlViewerInfo | null;
}

export function ModelInspector({ info }: Props) {
  const [open, setOpen] = useState(true);
  const [thinThreshold, setThinThreshold] = useState(1.2);

  const bbox = info?.bbox;
  const minDim = bbox ? Math.min(bbox.x, bbox.y, bbox.z) : null;
  const thinWall = minDim != null && minDim < thinThreshold;
  const empty = info?.empty || (info?.vertices === 0 && (info?.bytes || 0) > 0);

  return (
    <Card className="p-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-semibold w-full hover:text-accent transition-colors">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
          Model Inspection & Printability
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
            <div>Bounding box</div>
            <div className="text-accent">{bbox ? `${bbox.x} × ${bbox.y} × ${bbox.z} mm` : '—'}</div>
            <div>Vertices</div>
            <div className="text-accent">{info?.vertices?.toLocaleString() ?? '—'}</div>
            <div>Triangles</div>
            <div className="text-accent">{info?.triangles?.toLocaleString() ?? '—'}</div>
            <div>STL size</div>
            <div className="text-accent">{info ? `${(info.bytes / 1024).toFixed(1)} KB` : '—'}</div>
            <div>Volume <span className="text-muted-foreground">(approx)</span></div>
            <div className="text-accent">
              {info?.volumeMm3 != null ? `${(info.volumeMm3 / 1000).toFixed(2)} cm³` : '—'}
            </div>
            <div>Manifold check</div>
            <div className="text-muted-foreground">not available (no analyzer)</div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs">
            <label className="text-muted-foreground">Thin-wall threshold (mm)</label>
            <Input
              type="number"
              step="0.1"
              value={thinThreshold}
              onChange={(e) => setThinThreshold(parseFloat(e.target.value) || 0)}
              className="h-7 w-20 text-xs"
            />
            <span className="text-muted-foreground">approximate (smallest bbox dimension)</span>
          </div>

          <div className="mt-2 space-y-1">
            {empty && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded border border-destructive/30">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
                Mesh is empty — OpenSCAD produced no geometry.
              </div>
            )}
            {thinWall && !empty && (
              <div className="flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/30">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
                Thin wall warning (approx): smallest dimension {minDim?.toFixed(2)}mm &lt; {thinThreshold}mm.
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
