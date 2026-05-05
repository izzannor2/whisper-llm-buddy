import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Box, Circle, Cone, Cylinder, Type, Hexagon, Drill, Square, Wrench, CircleDot, Settings2 } from 'lucide-react';
import { SHAPE_DEFS, type ShapeKind } from '@/lib/threed-scene';

const ICONS: Record<ShapeKind, ComponentType<{ className?: string }>> = {
  cube: Box,
  rounded_box: Square,
  cylinder: Cylinder,
  cone: Cone,
  sphere: Circle,
  tube: CircleDot,
  text: Type,
  screw_hole: Drill,
  mounting_bracket: Wrench,
  rc_wheel: Hexagon,
  servo_mount: Settings2,
};

interface Props {
  onAdd: (kind: ShapeKind, asHole?: boolean) => void;
}

export function ShapeToolbox({ onAdd }: Props) {
  const kinds = Object.keys(SHAPE_DEFS) as ShapeKind[];
  return (
    <div className="flex flex-col gap-1 p-1.5 border border-border rounded-md bg-muted/30">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-0.5">Shapes</div>
      {kinds.map((k) => {
        const Icon = ICONS[k] || Box;
        return (
          <Button
            key={k}
            size="sm"
            variant="ghost"
            className="h-8 justify-start gap-2 text-xs"
            onClick={() => onAdd(k)}
            title={`Insert ${SHAPE_DEFS[k].label}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="truncate">{SHAPE_DEFS[k].label}</span>
          </Button>
        );
      })}
      <div className="border-t border-border my-1" />
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">Booleans</div>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAdd('cylinder', true)} title="Add a hole (subtracted cylinder)">
        Add Hole
      </Button>
    </div>
  );
}
