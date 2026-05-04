// OpenSCAD generation + lightweight validation
import { sendChatMessage, loadSettings } from '@/lib/chat-api';

export const SCAD_TEMPLATES: { id: string; label: string; prompt: string }[] = [
  { id: 'gear', label: 'Gear', prompt: 'Create an OpenSCAD parametric spur gear with 20 teeth, module 2, 5mm bore, 6mm thickness.' },
  { id: 'enclosure', label: 'Enclosure', prompt: 'Create an OpenSCAD parametric rectangular electronics enclosure 80x60x30mm with 2mm walls, screw posts in corners, snap-fit lid.' },
  { id: 'rc-mount', label: 'RC Mount', prompt: 'Create an OpenSCAD lightweight RC servo mount for an SG90 servo with 4 mounting holes spaced 28mm.' },
  { id: 'bracket', label: 'L-Bracket', prompt: 'Create an OpenSCAD 90 degree L-bracket 40x40x3mm with two M4 mounting holes per leg.' },
  { id: 'knob', label: 'Knob', prompt: 'Create an OpenSCAD knurled knob 25mm diameter, 12mm tall, with a 6mm D-shaft hole.' },
  { id: 'standoff', label: 'Standoffs', prompt: 'Create an OpenSCAD set of four 10mm tall PCB standoffs with M3 threaded inserts.' },
];

const SYSTEM_PROMPT = `You are an OpenSCAD expert. Output ONLY valid OpenSCAD code.
Rules:
- Begin with parameter variables at the top.
- Use modules for reusable parts.
- Include $fn = 64; for smooth curves.
- Do not include explanations, markdown fences, or prose.
- The output must compile in OpenSCAD as-is.`;

function stripFences(text: string): string {
  return text
    .replace(/```(?:openscad|scad)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

export interface ScadValidation {
  ok: boolean;
  errors: string[];
}

export function validateScad(code: string): ScadValidation {
  const errors: string[] = [];
  if (!code.trim()) errors.push('Empty model.');
  // Brace balance
  const open = (code.match(/{/g) || []).length;
  const close = (code.match(/}/g) || []).length;
  if (open !== close) errors.push(`Unbalanced braces (${open} open, ${close} close).`);
  const op = (code.match(/\(/g) || []).length;
  const cp = (code.match(/\)/g) || []).length;
  if (op !== cp) errors.push(`Unbalanced parentheses (${op} open, ${cp} close).`);
  // Heuristic: must reference at least one solid primitive or module call
  if (!/(cube|cylinder|sphere|polyhedron|linear_extrude|rotate_extrude|module\s+\w+)/.test(code)) {
    errors.push('No geometry primitives found.');
  }
  return { ok: errors.length === 0, errors };
}

export async function generateScad(prompt: string, signal?: AbortSignal): Promise<string> {
  const reply = await sendChatMessage({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    signal,
  } as any);
  const text = typeof reply === 'string' ? reply : (reply as any)?.content || '';
  return stripFences(text);
}

export async function generateScadWithFix(
  prompt: string,
  maxAttempts = 3,
  onStatus?: (s: 'thinking' | 'generating' | 'fixing') => void,
): Promise<{ code: string; attempts: number; errors: string[] }> {
  let code = '';
  let lastErrors: string[] = [];
  for (let i = 0; i < maxAttempts; i++) {
    onStatus?.(i === 0 ? 'generating' : 'fixing');
    const next = await generateScad(
      i === 0
        ? prompt
        : `The previous OpenSCAD code had these issues: ${lastErrors.join('; ')}. Original request: ${prompt}\nPrevious code:\n${code}\nReturn corrected OpenSCAD only.`,
    );
    code = next;
    const v = validateScad(code);
    if (v.ok) return { code, attempts: i + 1, errors: [] };
    lastErrors = v.errors;
  }
  return { code, attempts: maxAttempts, errors: lastErrors };
}
