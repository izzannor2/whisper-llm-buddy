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
  if (!code.trim()) {
    errors.push('Empty model — no OpenSCAD code generated.');
    return { ok: false, errors };
  }
  const open = (code.match(/{/g) || []).length;
  const close = (code.match(/}/g) || []).length;
  if (open !== close) errors.push(`Unbalanced braces (${open} open, ${close} close).`);
  const op = (code.match(/\(/g) || []).length;
  const cp = (code.match(/\)/g) || []).length;
  if (op !== cp) errors.push(`Unbalanced parentheses (${op} open, ${cp} close).`);
  if (!/(cube|cylinder|sphere|polyhedron|linear_extrude|rotate_extrude|module\s+\w+)/.test(code)) {
    errors.push('No geometry primitives or modules found.');
  }
  // Missing semicolons: only flag clear single-line variable assignments
  // (multi-line expressions and call chains produce too many false positives)
  const rawLines = code.split('\n');
  const stripped = rawLines.map(l => l.replace(/\/\/.*$/, '').trim());
  const badLines: number[] = [];
  stripped.forEach((line, i) => {
    if (!line) return;
    // Only check lines that look like a complete top-level assignment: `name = value`
    // with balanced parens/brackets on the same line, and no trailing terminator.
    if (!/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)) return;
    if (/[;{,]$/.test(line)) return;
    const op = (line.match(/\(/g) || []).length;
    const cp = (line.match(/\)/g) || []).length;
    const ob = (line.match(/\[/g) || []).length;
    const cb = (line.match(/\]/g) || []).length;
    if (op !== cp || ob !== cb) return; // multi-line expression
    badLines.push(i + 1);
  });
  if (badLines.length) errors.push(`Possible missing semicolons on line(s): ${badLines.slice(0, 5).join(', ')}${badLines.length > 5 ? '…' : ''}.`);
  // Module declared without name
  if (/\bmodule\s*\(/.test(code)) errors.push('Module declared without a name.');
  return { ok: errors.length === 0, errors };
}

export async function generateScad(prompt: string): Promise<string> {
  const settings = loadSettings();
  const text = await sendChatMessage(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    settings,
    undefined,
    { role: '3d-printing' } as any,
  );
  return stripFences(text || '');
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
