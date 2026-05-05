import { Eye, EyeOff, Copy, Trash2, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import type { SceneNode, Op } from '@/lib/threed-scene';

interface Props {
  nodes: SceneNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<SceneNode>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

const OP_BADGE: Record<Op, string> = {
  union: 'bg-green-500/20 text-green-400 border-green-500/40',
  difference: 'bg-red-500/20 text-red-400 border-red-500/40',
  intersection: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
};
const OP_LABEL: Record<Op, string> = { union: '+', difference: '−', intersection: '∩' };

export function SceneTree({ nodes, selectedId, onSelect, onUpdate, onDuplicate, onDelete, onMove }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="border border-border rounded-md bg-muted/20 p-1.5 flex flex-col">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">Scene Tree</div>
      {nodes.length === 0 && <div className="text-xs text-muted-foreground px-2 py-3 italic">No shapes yet — pick one from the toolbox.</div>}
      <div className="space-y-0.5 max-h-64 overflow-auto">
        {nodes.map((n, i) => {
          const sel = n.id === selectedId;
          return (
            <div
              key={n.id}
              className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs cursor-pointer hover:bg-accent/10 ${sel ? 'bg-accent/20 ring-1 ring-accent/60' : ''}`}
              onClick={() => onSelect(n.id)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate(n.id, { visible: !n.visible }); }}
                className="text-muted-foreground hover:text-foreground"
                title={n.visible ? 'Hide' : 'Show'}
              >
                {n.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <span className={`px-1 py-px rounded border text-[9px] font-mono ${OP_BADGE[n.op]}`} title={n.op}>{OP_LABEL[n.op]}</span>
              {editing === n.id ? (
                <Input
                  autoFocus
                  defaultValue={n.name}
                  onBlur={(e) => { onUpdate(n.id, { name: e.target.value || n.name }); setEditing(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="h-5 px-1 text-xs"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate" onDoubleClick={(e) => { e.stopPropagation(); setEditing(n.id); }}>{n.name}</span>
              )}
              <span className="text-[9px] text-muted-foreground font-mono">{n.kind}</span>
              <button onClick={(e) => { e.stopPropagation(); setEditing(n.id); }} className="text-muted-foreground hover:text-foreground" title="Rename"><Pencil className="w-3 h-3" /></button>
              <button onClick={(e) => { e.stopPropagation(); onMove(n.id, -1); }} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up"><ArrowUp className="w-3 h-3" /></button>
              <button onClick={(e) => { e.stopPropagation(); onMove(n.id, 1); }} disabled={i === nodes.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down"><ArrowDown className="w-3 h-3" /></button>
              <button onClick={(e) => { e.stopPropagation(); onDuplicate(n.id); }} className="text-muted-foreground hover:text-foreground" title="Duplicate"><Copy className="w-3 h-3" /></button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(n.id); }} className="text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="w-3 h-3" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
