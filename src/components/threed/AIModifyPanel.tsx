import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';
import { sendChatMessage, loadSettings } from '@/lib/chat-api';

interface Props {
  scad: string;
  onResult: (newScad: string) => void;
  onStatus: (msg: string) => void;
}

const QUICK_PROMPTS = [
  'Make this 10mm wider',
  'Add screw holes in the corners',
  'Round the edges',
  'Make the walls thicker',
  'Add mounting tabs',
  'Add a vent pattern on top',
];

const SYSTEM = `You are an OpenSCAD expert. The user will give you EXISTING OpenSCAD code and a modification request.
Modify only what the request asks. Keep the rest of the code intact. Return ONLY the new full OpenSCAD file — no markdown fences, no commentary.`;

export function AIModifyPanel({ scad, onResult, onStatus }: Props) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (text: string) => {
    if (!text.trim() || !scad.trim()) {
      onStatus('Need both an existing SCAD model and a modify request.');
      return;
    }
    setBusy(true);
    onStatus(`AI modifying: "${text}"…`);
    try {
      const settings = loadSettings();
      const reply = await sendChatMessage(
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Existing OpenSCAD:\n${scad}\n\nModification request: ${text}` },
        ],
        settings,
        undefined,
        { role: '3d-printing' } as any,
      );
      const cleaned = (reply || '').replace(/```(?:openscad|scad)?\s*/gi, '').replace(/```/g, '').trim();
      if (!cleaned) {
        onStatus('AI returned no code.');
      } else {
        onResult(cleaned);
        onStatus('AI modify applied.');
      }
    } catch (e) {
      onStatus(e instanceof Error ? e.message : 'AI modify failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border rounded-md bg-muted/20 p-2 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI Modify</div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder='e.g. "Make it 10mm wider and add 4 screw holes"'
        className="text-xs min-h-[60px]"
      />
      <div className="flex flex-wrap gap-1">
        {QUICK_PROMPTS.map((q) => (
          <Button key={q} size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => void run(q)} disabled={busy}>
            {q}
          </Button>
        ))}
      </div>
      <Button size="sm" className="w-full h-7 text-xs" onClick={() => void run(prompt)} disabled={busy || !prompt.trim()}>
        <Sparkles className="w-3 h-3 mr-1.5" />{busy ? 'Modifying…' : 'Apply Modify'}
      </Button>
      <p className="text-[10px] text-muted-foreground">
        Modifies the existing SCAD code rather than replacing the whole project. Falls back to no change if the AI fails.
      </p>
    </div>
  );
}
