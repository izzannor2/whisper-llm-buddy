import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface PrinterConstraints {
  bedX: number;
  bedY: number;
  bedZ: number;
  nozzle: number;
  layerHeight: number;
  minWall: number;
  filament: string;
}

export const DEFAULT_PRINTER: PrinterConstraints = {
  bedX: 220, bedY: 220, bedZ: 250, nozzle: 0.4, layerHeight: 0.2, minWall: 0.8, filament: 'PLA',
};

interface Props {
  value: PrinterConstraints;
  onChange: (v: PrinterConstraints) => void;
}

export function PrinterConstraintsPanel({ value, onChange }: Props) {
  const set = <K extends keyof PrinterConstraints>(k: K, v: PrinterConstraints[K]) => onChange({ ...value, [k]: v });
  const num = (k: keyof PrinterConstraints, label: string, step = 0.1) => (
    <div className="flex items-center gap-1">
      <Label className="text-[10px] flex-1 truncate">{label}</Label>
      <Input
        type="number" step={step}
        value={String(value[k] as number)}
        onChange={(e) => set(k, (parseFloat(e.target.value) || 0) as any)}
        className="h-6 text-[10px] w-20"
      />
    </div>
  );
  return (
    <div className="border border-border rounded-md bg-muted/20 p-2 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Printer Constraints</div>
      {num('bedX', 'Bed X (mm)', 1)}
      {num('bedY', 'Bed Y (mm)', 1)}
      {num('bedZ', 'Bed Z (mm)', 1)}
      {num('nozzle', 'Nozzle Ø')}
      {num('layerHeight', 'Layer height')}
      {num('minWall', 'Min wall')}
      <div className="flex items-center gap-1">
        <Label className="text-[10px] flex-1">Filament</Label>
        <select value={value.filament} onChange={(e) => set('filament', e.target.value)}
          className="h-6 text-[10px] w-20 rounded border border-input bg-background">
          {['PLA', 'PETG', 'ABS', 'TPU', 'ASA'].map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>
    </div>
  );
}

export function checkPrintability(bbox: { x: number; y: number; z: number } | null, constraints: PrinterConstraints): string[] {
  const warnings: string[] = [];
  if (bbox) {
    if (bbox.x > constraints.bedX) warnings.push(`Width ${bbox.x}mm exceeds bed X (${constraints.bedX}mm).`);
    if (bbox.y > constraints.bedY) warnings.push(`Depth ${bbox.y}mm exceeds bed Y (${constraints.bedY}mm).`);
    if (bbox.z > constraints.bedZ) warnings.push(`Height ${bbox.z}mm exceeds bed Z (${constraints.bedZ}mm).`);
  }
  return warnings;
}
