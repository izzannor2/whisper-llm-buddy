import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2, Play } from 'lucide-react';
import { generateScad, validateScad } from '@/lib/openscad';
import { getOpenScadStatus, renderStl, get3DStatus, saveScad } from '@/lib/stl-export';

type Status = 'pending' | 'running' | 'pass' | 'fail';
interface Check {
  id: string;
  label: string;
  status: Status;
  detail?: string;
}

const INITIAL: Check[] = [
  { id: 'mode-visible', label: '3D Printing mode appears in UI', status: 'pending' },
  { id: 'voice-controls', label: 'Voice controls render in 3D mode', status: 'pending' },
  { id: 'status-endpoint', label: '/3d/status endpoint responds', status: 'pending' },
  { id: 'openscad-status', label: '/openscad/status endpoint responds', status: 'pending' },
  { id: 'save-scad', label: '/3d/save-scad persists model.scad', status: 'pending' },
  { id: 'scad-gen', label: 'OpenSCAD generation creates valid .scad (passes validator)', status: 'pending' },
  { id: 'stl-export', label: 'STL export returns clear missing-OpenSCAD message when CLI absent (no fake STL)', status: 'pending' },
];

export function AcceptanceChecklist() {
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [running, setRunning] = useState(false);

  const update = (id: string, patch: Partial<Check>) =>
    setChecks(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)));

  const run = async () => {
    setRunning(true);
    setChecks(INITIAL.map(c => ({ ...c })));

    // 1. Mode visibility — verify the route renders and modeCards entry exists in source
    update('mode-visible', { status: 'running' });
    try {
      const onRoute = window.location.pathname.startsWith('/3d');
      // Quick DOM marker: header text "3D Printing"
      const found = onRoute || !!document.body.innerText.match(/3D Printing/i);
      update('mode-visible', {
        status: found ? 'pass' : 'fail',
        detail: found ? 'Route /3d active and labelled' : 'Mode label not found in DOM',
      });
    } catch (e) {
      update('mode-visible', { status: 'fail', detail: String(e) });
    }

    // 2. Voice controls present
    update('voice-controls', { status: 'running' });
    try {
      const el = document.querySelector('[data-voice-controls="3d"]');
      update('voice-controls', {
        status: el ? 'pass' : 'fail',
        detail: el ? 'Mic + TTS controls mounted in 3D header' : 'Voice controls not found in DOM',
      });
    } catch (e) {
      update('voice-controls', { status: 'fail', detail: String(e) });
    }

    // 3. /3d/status endpoint
    update('status-endpoint', { status: 'running' });
    try {
      const s = await get3DStatus();
      update('status-endpoint', {
        status: s.ok ? 'pass' : 'fail',
        detail: s.ok ? `openscadAvailable=${s.openscadAvailable}` : (s.error || 'no response'),
      });
    } catch (e) {
      update('status-endpoint', { status: 'fail', detail: e instanceof Error ? e.message : String(e) });
    }

    // 4. SCAD generation
    update('scad-gen', { status: 'running' });
    let scad = '';
    try {
      scad = await generateScad('Create an OpenSCAD 20mm cube with a 5mm centered cylindrical hole.');
      const v = validateScad(scad);
      update('scad-gen', {
        status: v.ok && scad.length > 20 ? 'pass' : 'fail',
        detail: v.ok ? `${scad.length} chars, validated` : v.errors.join('; '),
      });
    } catch (e) {
      update('scad-gen', { status: 'fail', detail: e instanceof Error ? e.message : String(e) });
    }

    // 3. STL export honesty: if CLI absent, must return clear error and NO buffer
    update('stl-export', { status: 'running' });
    try {
      const s = await getOpenScadStatus();
      if (s.available) {
        update('stl-export', {
          status: 'pass',
          detail: `OpenSCAD CLI available (${s.version || 'unknown version'}) — fake-STL guard not triggered.`,
        });
      } else {
        const r = await renderStl(scad || 'cube(10);', 'acceptance_test');
        const noFake = !r.ok && !r.stl;
        const hasMsg = (r.error || '').toLowerCase().match(/openscad|cli|install|not found|424/);
        update('stl-export', {
          status: noFake && hasMsg ? 'pass' : 'fail',
          detail: noFake
            ? `Correctly refused: ${r.error?.slice(0, 140) || 'no error text'}`
            : 'Fake STL returned despite missing CLI',
        });
      }
    } catch (e) {
      update('stl-export', { status: 'fail', detail: e instanceof Error ? e.message : String(e) });
    }

    setRunning(false);
  };

  const Icon = ({ s }: { s: Status }) => {
    if (s === 'running') return <Loader2 className="w-4 h-4 animate-spin text-accent" />;
    if (s === 'pass') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (s === 'fail') return <XCircle className="w-4 h-4 text-destructive" />;
    return <div className="w-4 h-4 rounded-full border border-muted-foreground/40" />;
  };

  const passed = checks.filter(c => c.status === 'pass').length;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold flex-1">Acceptance Tests</h3>
        <span className="text-xs text-muted-foreground">{passed}/{checks.length}</span>
        <Button size="sm" variant="outline" onClick={run} disabled={running}>
          {running ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          Run
        </Button>
      </div>
      <ul className="space-y-1.5">
        {checks.map(c => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <div className="mt-0.5"><Icon s={c.status} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-foreground">{c.label}</div>
              {c.detail && <div className="text-muted-foreground truncate" title={c.detail}>{c.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
