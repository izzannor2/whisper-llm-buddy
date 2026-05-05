import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Eraser, Undo2, Trash2, Check } from 'lucide-react';

interface Props {
  onSave: (dataUrl: string | null) => void;
  saved: string | null;
}

export function SketchPad({ onSave, saved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#0f0f14';
    ctx.fillRect(0, 0, c.width, c.height);
    historyRef.current = [ctx.getImageData(0, 0, c.width, c.height)];
  }, []);

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;
  const pushHistory = () => {
    const c = canvasRef.current; const x = ctx(); if (!c || !x) return;
    historyRef.current.push(x.getImageData(0, 0, c.width, c.height));
    if (historyRef.current.length > 30) historyRef.current.shift();
  };

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
  };

  const onDown = (e: React.PointerEvent) => {
    drawingRef.current = true; pushHistory();
    lastRef.current = pos(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const x = ctx(); if (!x || !lastRef.current) return;
    const p = pos(e);
    x.strokeStyle = tool === 'pen' ? '#e8e8f0' : '#0f0f14';
    x.lineWidth = tool === 'pen' ? 2.5 : 14;
    x.lineCap = 'round';
    x.beginPath(); x.moveTo(lastRef.current.x, lastRef.current.y); x.lineTo(p.x, p.y); x.stroke();
    lastRef.current = p;
  };
  const onUp = () => { drawingRef.current = false; lastRef.current = null; };

  const undo = () => {
    const c = canvasRef.current; const x = ctx(); if (!c || !x) return;
    const last = historyRef.current.pop();
    if (last) x.putImageData(last, 0, 0);
  };
  const clear = () => {
    const c = canvasRef.current; const x = ctx(); if (!c || !x) return;
    pushHistory();
    x.fillStyle = '#0f0f14'; x.fillRect(0, 0, c.width, c.height);
  };
  const save = () => {
    const c = canvasRef.current; if (!c) return;
    onSave(c.toDataURL('image/png'));
  };

  return (
    <div className="border border-border rounded-md bg-muted/20 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sketch Pad</div>
        {saved && <span className="text-[9px] text-green-400">✓ saved as reference</span>}
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={180}
        className="w-full border border-border rounded bg-[#0f0f14] cursor-crosshair touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      <div className="flex gap-1">
        <Button size="sm" variant={tool === 'pen' ? 'default' : 'outline'} className="h-6 text-[10px] px-2" onClick={() => setTool('pen')}>
          <Pencil className="w-3 h-3 mr-1" />Pen
        </Button>
        <Button size="sm" variant={tool === 'eraser' ? 'default' : 'outline'} className="h-6 text-[10px] px-2" onClick={() => setTool('eraser')}>
          <Eraser className="w-3 h-3 mr-1" />Eraser
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={undo}>
          <Undo2 className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={clear}>
          <Trash2 className="w-3 h-3" />
        </Button>
        <Button size="sm" className="h-6 text-[10px] px-2 ml-auto" onClick={save}>
          <Check className="w-3 h-3 mr-1" />Use as reference
        </Button>
      </div>
    </div>
  );
}
