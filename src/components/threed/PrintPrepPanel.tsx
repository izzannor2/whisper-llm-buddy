import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Maximize2, Move3D, RotateCcw } from 'lucide-react';
import type { Scene, SceneNode } from '@/lib/threed-scene';
import type { PrinterConstraints } from './PrinterConstraintsPanel';
import type { StlViewerInfo } from './StlViewer';

interface Props {
  scene: Scene;
  printer: PrinterConstraints;
  viewer: StlViewerInfo | null;
  onScene: (s: Scene) => void;
}

// Approximate per-node bounding box from primitive params.
function nodeApproxBounds(n: SceneNode): { sx: number; sy: number; sz: number } {
  const p = n.params;
  const num = (k: string, d = 0) => {
    const v = p[k];
    return typeof v === 'number' ? v : Number.parseFloat(String(v ?? '')) || d;
  };
  switch (n.kind) {
    case 'cube':
    case 'rounded_box':
      return { sx: num('width', 20), sy: num('depth', 20), sz: num('height', 20) };
    case 'cylinder':
    case 'cone':
      return { sx: Math.max(num('diameter', 20), num('diameter1', 20), num('diameter2', 0)), sy: 0, sz: num('height', 20) };
    case 'sphere':
      return { sx: num('diameter', 20), sy: num('diameter', 20), sz: num('diameter', 20) };
    case 'tube':
      return { sx: num('outerDiameter', 20), sy: num('outerDiameter', 20), sz: num('height', 10) };
    case 'screw_hole':
      return { sx: num('diameter', 3), sy: num('diameter', 3), sz: num('depth', 20) };
    case 'text':
      return { sx: String(p.content ?? '').length * num('size', 8) * 0.6, sy: num('size', 8), sz: num('height', 2) };
    default:
      return { sx: 20, sy: 20, sz: 20 };
  }
}

// Scene-level bbox including transform offsets.
function sceneBounds(scene: Scene) {
  if (!scene.nodes.length) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const n of scene.nodes) {
    if (!n.visible) continue;
    const b = nodeApproxBounds(n);
    const sx = (n.scale?.x ?? 1) * b.sx, sy = (n.scale?.y ?? 1) * (b.sy || b.sx), sz = (n.scale?.z ?? 1) * b.sz;
    minX = Math.min(minX, n.pos.x - sx / 2); maxX = Math.max(maxX, n.pos.x + sx / 2);
    minY = Math.min(minY, n.pos.y - sy / 2); maxY = Math.max(maxY, n.pos.y + sy / 2);
    minZ = Math.min(minZ, n.pos.z - sz / 2); maxZ = Math.max(maxZ, n.pos.z + sz / 2);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
  };
}

export function PrintPrepPanel({ scene, printer, viewer, onScene }: Props) {
  const bounds = useMemo(() => sceneBounds(scene), [scene]);

  const warnings = useMemo(() => {
    const out: string[] = [];
    if (bounds) {
      if (bounds.size.x > printer.bedX) out.push(`Width ${bounds.size.x.toFixed(1)}mm exceeds bed X (${printer.bedX}mm).`);
      if (bounds.size.y > printer.bedY) out.push(`Depth ${bounds.size.y.toFixed(1)}mm exceeds bed Y (${printer.bedY}mm).`);
      if (bounds.size.z > printer.bedZ) out.push(`Height ${bounds.size.z.toFixed(1)}mm exceeds bed Z (${printer.bedZ}mm).`);
      if (Math.min(bounds.size.x, bounds.size.y) < 5) out.push('Footprint <5mm — likely to topple while printing.');
    }
    // Thin walls based on scene primitives
    for (const n of scene.nodes) {
      if (!n.visible) continue;
      if (n.kind === 'tube') {
        const od = Number(n.params.outerDiameter ?? 0), id = Number(n.params.innerDiameter ?? 0);
        const wall = (od - id) / 2;
        if (wall > 0 && wall < printer.minWall) out.push(`${n.name}: wall ${wall.toFixed(2)}mm < min ${printer.minWall}mm.`);
      }
      if (n.kind === 'screw_hole') {
        const d = Number(n.params.diameter ?? 0);
        if (d > 0 && d < 1.0) out.push(`${n.name}: hole Ø ${d.toFixed(2)}mm is too small for FDM.`);
      }
    }
    if (viewer?.triangles && viewer.triangles > 500_000) {
      out.push(`Mesh has ${viewer.triangles.toLocaleString()} triangles — slicer may be slow.`);
    }
    return out;
  }, [scene, printer, bounds, viewer]);

  const autoCenter = () => {
    if (!bounds) return;
    const dx = -bounds.center.x, dy = -bounds.center.y, dz = -bounds.min.z;
    onScene({
      ...scene,
      nodes: scene.nodes.map((n) => ({ ...n, pos: { x: n.pos.x + dx, y: n.pos.y + dy, z: n.pos.z + dz } })),
    });
  };

  const layFlat = () => {
    onScene({ ...scene, nodes: scene.nodes.map((n) => ({ ...n, rot: { x: 0, y: 0, z: 0 } })) });
  };

  const scaleToFit = () => {
    if (!bounds) return;
    const margin = 0.95;
    const fx = (printer.bedX * margin) / Math.max(bounds.size.x, 0.001);
    const fy = (printer.bedY * margin) / Math.max(bounds.size.y, 0.001);
    const fz = (printer.bedZ * margin) / Math.max(bounds.size.z, 0.001);
    const f = Math.min(fx, fy, fz);
    if (f >= 0.999 && f <= 1.001) return;
    onScene({
      ...scene,
      nodes: scene.nodes.map((n) => ({
        ...n,
        scale: { x: (n.scale?.x ?? 1) * f, y: (n.scale?.y ?? 1) * f, z: (n.scale?.z ?? 1) * f },
        pos: { x: n.pos.x * f, y: n.pos.y * f, z: n.pos.z * f },
      })),
    });
  };

  return (
    <div className="border border-border rounded-md bg-muted/20 p-2 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Print Prep</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono">
        <span className="text-muted-foreground">Scene size</span>
        <span className="text-accent">
          {bounds ? `${bounds.size.x.toFixed(1)} × ${bounds.size.y.toFixed(1)} × ${bounds.size.z.toFixed(1)} mm` : '—'}
        </span>
        <span className="text-muted-foreground">Bed</span>
        <span className="text-accent">{printer.bedX} × {printer.bedY} × {printer.bedZ} mm</span>
        <span className="text-muted-foreground">Triangles</span>
        <span className="text-accent">{viewer?.triangles?.toLocaleString() ?? '—'}</span>
        <span className="text-muted-foreground">Volume (rendered)</span>
        <span className="text-accent">{viewer?.volumeMm3 != null ? `${(viewer.volumeMm3 / 1000).toFixed(2)} cm³` : '—'}</span>
      </div>

      <div className="grid grid-cols-3 gap-1 pt-1">
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={autoCenter} disabled={!bounds}>
          <Move3D className="w-3 h-3 mr-1" />Center
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={scaleToFit} disabled={!bounds}>
          <Maximize2 className="w-3 h-3 mr-1" />Fit Bed
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={layFlat} disabled={!scene.nodes.length}>
          <RotateCcw className="w-3 h-3 mr-1" />Lay Flat
        </Button>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-0.5 pt-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-1">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[9px] text-muted-foreground leading-snug">
        Approximate: bbox uses primitive params + transforms. Final geometry is whatever OpenSCAD renders.
      </p>
    </div>
  );
}
