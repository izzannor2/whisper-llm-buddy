import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, X, Upload } from 'lucide-react';

interface Props {
  imageDataUrl: string | null;
  onChange: (dataUrl: string | null) => void;
}

export function ReferenceImagePanel({ imageDataUrl, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => onChange(typeof r.result === 'string' ? r.result : null);
    r.readAsDataURL(file);
  };

  return (
    <div
      className={`border rounded-md p-2 space-y-2 transition-colors ${drag ? 'border-accent bg-accent/10' : 'border-border bg-muted/20'}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0]; if (f) readFile(f);
      }}
      onPaste={(e) => {
        const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
        const f = item?.getAsFile(); if (f) readFile(f);
      }}
      tabIndex={0}
    >
      <div className="flex items-center gap-2">
        <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reference Image</div>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => inputRef.current?.click()}>
            <Upload className="w-3 h-3 mr-1" />Upload
          </Button>
          {imageDataUrl && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onChange(null)}>
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.currentTarget.value = ''; }} />
      {imageDataUrl ? (
        <img src={imageDataUrl} alt="reference" className="w-full max-h-32 object-contain rounded bg-black/20" />
      ) : (
        <div className="text-[10px] text-muted-foreground italic text-center py-4">
          Drop, paste, or upload an image. Used as AI design context.
        </div>
      )}
      <p className="text-[9px] text-muted-foreground leading-snug">
        Approximate: reference image guides the AI prompt; output is editable CAD primitives / OpenSCAD, not direct image-to-3D.
      </p>
    </div>
  );
}
