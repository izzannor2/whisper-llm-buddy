import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Button } from '@/components/ui/button';
import { Move, RotateCw, Maximize2, Magnet, Grid3x3, Camera, Crosshair, MousePointer2 } from 'lucide-react';
import type { Scene, SceneNode } from '@/lib/threed-scene';

const SNAP_TOL = 2.0; // mm — distance under which a soft snap engages
const GUIDE_COLOR = { center: 0x5cffd1, face: 0xffd166, axis: 0x7c5cff };

interface Props {
  scene: Scene;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<SceneNode>) => void;
  onScreenshot?: (dataUrl: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onSetOp?: (id: string, op: SceneNode['op']) => void;
}

type Mode = 'select' | 'translate' | 'rotate' | 'scale';

const MAT_OP: Record<SceneNode['op'], number> = {
  union: 0x7c5cff,
  difference: 0xff5c8a,
  intersection: 0x5cffd1,
};

function buildMesh(node: SceneNode): THREE.Mesh {
  let geom: THREE.BufferGeometry;
  const p = node.params;
  const num = (k: string, d: number) => {
    const v = p[k];
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : d;
  };
  switch (node.kind) {
    case 'cube':
    case 'rounded_box':
      geom = new THREE.BoxGeometry(num('width', 20), num('height', 20), num('depth', 20));
      break;
    case 'cylinder':
      geom = new THREE.CylinderGeometry(num('diameter', 20) / 2, num('diameter', 20) / 2, num('height', 20), 32);
      geom.rotateX(Math.PI / 2);
      break;
    case 'cone':
      geom = new THREE.CylinderGeometry(num('diameter2', 0) / 2, num('diameter1', 20) / 2, num('height', 20), 32);
      geom.rotateX(Math.PI / 2);
      break;
    case 'sphere':
      geom = new THREE.SphereGeometry(num('diameter', 20) / 2, 24, 16);
      break;
    case 'tube': {
      const od = num('outerDiameter', 20) / 2;
      const id = num('innerDiameter', 14) / 2;
      const h = num('height', 10);
      const shape = new THREE.Shape();
      shape.absarc(0, 0, od, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, id, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      geom = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      geom.translate(0, 0, -h / 2);
      break;
    }
    case 'screw_hole':
      geom = new THREE.CylinderGeometry(num('diameter', 3.2) / 2, num('diameter', 3.2) / 2, num('depth', 20), 16);
      geom.rotateX(Math.PI / 2);
      break;
    default:
      geom = new THREE.BoxGeometry(num('width', 30), num('height', 20), num('depth', 20));
  }
  const isSub = node.op === 'difference';
  const mat = new THREE.MeshStandardMaterial({
    color: MAT_OP[node.op],
    metalness: 0.1,
    roughness: 0.6,
    transparent: isSub,
    opacity: isSub ? 0.55 : 1,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(node.pos.x, node.pos.y, node.pos.z);
  mesh.rotation.set(
    (node.rot.x * Math.PI) / 180,
    (node.rot.y * Math.PI) / 180,
    (node.rot.z * Math.PI) / 180,
  );
  if (node.scale) mesh.scale.set(node.scale.x, node.scale.y, node.scale.z);
  mesh.userData.nodeId = node.id;
  mesh.userData.locked = !!node.locked;
  return mesh;
}

function snapValue(v: number, step: number) {
  if (!step) return v;
  return Math.round(v / step) * step;
}

interface CtxMenu { x: number; y: number; nodeId: string }

export function SceneViewer({ scene, selectedId, onSelect, onUpdate, onScreenshot, onDelete, onDuplicate, onSetOp }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const groupRef = useRef<THREE.Group | null>(null);
  const guidesRef = useRef<THREE.Group | null>(null);
  const highlightRef = useRef<THREE.LineSegments | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const onUpdateRef = useRef(onUpdate);
  const onSelectRef = useRef(onSelect);
  const onDeleteRef = useRef(onDelete);
  const onDuplicateRef = useRef(onDuplicate);
  const snapRef = useRef(true);
  const sceneNodesRef = useRef<SceneNode[]>([]);
  const selectedIdRef = useRef<string | null>(selectedId);

  const [mode, setMode] = useState<Mode>('translate');
  const [snap, setSnap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [snapHints, setSnapHints] = useState<string[]>([]);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);
  useEffect(() => { onDuplicateRef.current = onDuplicate; }, [onDuplicate]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Camera presets
  const setView = (v: 'top' | 'front' | 'right' | 'iso' | 'fit') => {
    const camera = cameraRef.current; const orbit = orbitRef.current; if (!camera || !orbit) return;
    if (v === 'fit') {
      const sel = selectedIdRef.current ? meshesRef.current.get(selectedIdRef.current) : null;
      const target = sel ?? groupRef.current;
      if (!target || (target as THREE.Group).children?.length === 0 && !sel) return;
      const box = new THREE.Box3().setFromObject(target as THREE.Object3D);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 10);
      const dist = maxDim * 2.2;
      const dir = camera.position.clone().sub(orbit.target).normalize();
      camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
      orbit.target.copy(center);
      orbit.update();
      return;
    }
    const d = 140;
    if (v === 'top')   camera.position.set(0, d, 0.001);
    if (v === 'front') camera.position.set(0, 0, d);
    if (v === 'right') camera.position.set(d, 0, 0);
    if (v === 'iso')   camera.position.set(d * 0.7, d * 0.7, d * 0.7);
    orbit.target.set(0, 0, 0);
    camera.up.set(0, 1, 0);
    orbit.update();
  };

  // Mount once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = mount.clientWidth, h = mount.clientHeight;
    const sceneObj = new THREE.Scene();
    sceneObj.background = new THREE.Color(0x0a0a0f);
    sceneRef.current = sceneObj;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
    camera.position.set(80, 80, 80);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbitRef.current = orbit;

    const guides = new THREE.Group();
    guides.name = 'snapGuides';
    sceneObj.add(guides);
    guidesRef.current = guides;

    const clearGuides = () => {
      while (guides.children.length) {
        const c = guides.children.pop()!;
        (c as any).geometry?.dispose?.();
        (c as any).material?.dispose?.();
      }
    };

    const addLine = (a: THREE.Vector3, b: THREE.Vector3, color: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
      guides.add(new THREE.Line(g, m));
    };
    const addMarker = (p: THREE.Vector3, color: number) => {
      const g = new THREE.SphereGeometry(0.8, 12, 12);
      const m = new THREE.MeshBasicMaterial({ color });
      const s = new THREE.Mesh(g, m);
      s.position.copy(p);
      guides.add(s);
    };

    const applyLiveSnap = (obj: THREE.Mesh): string[] => {
      clearGuides();
      const hints: string[] = [];
      if (!snapRef.current) return hints;
      const targetId = obj.userData.nodeId as string;
      const others = Array.from(meshesRef.current.values()).filter((m) => m.userData.nodeId !== targetId);
      if (!others.length) return hints;
      const tBox = new THREE.Box3().setFromObject(obj);
      const tCenter = tBox.getCenter(new THREE.Vector3());
      const tHalf = tBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const snapped = { x: false, y: false, z: false };
      for (const ref of others) {
        const rBox = new THREE.Box3().setFromObject(ref);
        const rCenter = rBox.getCenter(new THREE.Vector3());
        const rHalf = rBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        (['x', 'y', 'z'] as const).forEach((ax) => {
          if (snapped[ax]) return;
          if (Math.abs(tCenter[ax] - rCenter[ax]) < SNAP_TOL) {
            obj.position[ax] += (rCenter[ax] - tCenter[ax]);
            snapped[ax] = true;
            const a = rCenter.clone(); a[ax] -= 60;
            const b = rCenter.clone(); b[ax] += 60;
            addLine(a, b, GUIDE_COLOR.axis);
            hints.push(`align ${ax.toUpperCase()} centers`);
          }
        });
        (['x', 'y', 'z'] as const).forEach((ax) => {
          for (const sgn of [1, -1] as const) {
            const refFace = rCenter[ax] + sgn * rHalf[ax];
            const tgtOpposite = tCenter[ax] - sgn * tHalf[ax];
            if (Math.abs(refFace - tgtOpposite) < SNAP_TOL) {
              obj.position[ax] += (refFace - tgtOpposite);
              const p = rCenter.clone(); p[ax] = refFace;
              addMarker(p, GUIDE_COLOR.face);
              hints.push(`face ${sgn > 0 ? '+' : '−'}${ax.toUpperCase()} touch`);
            }
          }
        });
        if (tCenter.distanceTo(rCenter) < SNAP_TOL) {
          obj.position.add(rCenter.clone().sub(tCenter));
          addMarker(rCenter, GUIDE_COLOR.center);
          hints.push('center↔center');
        }
      }
      return hints;
    };

    const transform = new TransformControls(camera, renderer.domElement);
    transform.addEventListener('dragging-changed', (e: any) => {
      orbit.enabled = !e.value;
      if (!e.value) { clearGuides(); setSnapHints([]); }
    });
    transform.addEventListener('objectChange', () => {
      const obj = transform.object as THREE.Mesh | undefined;
      if (!obj) return;
      // Keep selection highlight glued to the mesh while dragging
      const hl = highlightRef.current;
      if (hl) {
        hl.position.copy(obj.position);
        hl.rotation.copy(obj.rotation);
        hl.scale.copy(obj.scale);
      }
      if (snapRef.current && transform.mode === 'rotate') {
        const step = (15 * Math.PI) / 180;
        obj.rotation.x = snapValue(obj.rotation.x, step);
        obj.rotation.y = snapValue(obj.rotation.y, step);
        obj.rotation.z = snapValue(obj.rotation.z, step);
      }
      if (transform.mode === 'translate') {
        const hints = applyLiveSnap(obj);
        setSnapHints(hints);
        if (snapRef.current && !hints.length) {
          obj.position.x = snapValue(obj.position.x, 1);
          obj.position.y = snapValue(obj.position.y, 1);
          obj.position.z = snapValue(obj.position.z, 1);
        }
      }
    });
    transform.addEventListener('mouseUp', () => {
      const obj = transform.object as THREE.Mesh | undefined;
      clearGuides();
      setSnapHints([]);
      if (!obj) return;
      const id = obj.userData.nodeId as string;
      onUpdateRef.current(id, {
        pos: { x: +obj.position.x.toFixed(2), y: +obj.position.y.toFixed(2), z: +obj.position.z.toFixed(2) },
        rot: {
          x: +((obj.rotation.x * 180) / Math.PI).toFixed(2),
          y: +((obj.rotation.y * 180) / Math.PI).toFixed(2),
          z: +((obj.rotation.z * 180) / Math.PI).toFixed(2),
        },
        scale: { x: +obj.scale.x.toFixed(3), y: +obj.scale.y.toFixed(3), z: +obj.scale.z.toFixed(3) },
      });
    });
    sceneObj.add(transform);
    transformRef.current = transform;

    sceneObj.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(60, 100, 40);
    sceneObj.add(dir);

    const grid = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    grid.name = 'grid';
    sceneObj.add(grid);

    const group = new THREE.Group();
    sceneObj.add(group);
    groupRef.current = group;

    const onPointerDown = (ev: PointerEvent) => {
      if ((ev.target as HTMLElement) !== renderer.domElement) return;
      if (ev.button !== 0) return; // left click only for select
      setCtxMenu(null);
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const hits = raycasterRef.current.intersectObjects(group.children, false);
      if (hits.length) {
        const id = (hits[0].object as THREE.Mesh).userData.nodeId as string;
        onSelectRef.current(id);
      } else {
        onSelectRef.current(null);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onContext = (ev: MouseEvent) => {
      ev.preventDefault();
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const hits = raycasterRef.current.intersectObjects(group.children, false);
      if (hits.length) {
        const id = (hits[0].object as THREE.Mesh).userData.nodeId as string;
        onSelectRef.current(id);
        setCtxMenu({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, nodeId: id });
      } else {
        setCtxMenu(null);
      }
    };
    renderer.domElement.addEventListener('contextmenu', onContext);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(sceneObj, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const W = mount.clientWidth, H = mount.clientHeight;
      camera.aspect = W / H; camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('contextmenu', onContext);
      transform.dispose();
      renderer.dispose();
      try { mount.removeChild(renderer.domElement); } catch {}
    };
  }, []);

  // Update selection highlight (yellow wireframe edges that follow the mesh)
  const updateHighlight = () => {
    const sceneObj = sceneRef.current; if (!sceneObj) return;
    if (highlightRef.current) {
      sceneObj.remove(highlightRef.current);
      (highlightRef.current.geometry as any)?.dispose?.();
      ((highlightRef.current.material as THREE.Material) as any)?.dispose?.();
      highlightRef.current = null;
    }
    const id = selectedIdRef.current;
    if (!id) return;
    const mesh = meshesRef.current.get(id);
    if (!mesh) return;
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthTest: false });
    const lines = new THREE.LineSegments(edges, mat);
    lines.renderOrder = 999;
    lines.position.copy(mesh.position);
    lines.rotation.copy(mesh.rotation);
    lines.scale.copy(mesh.scale);
    sceneObj.add(lines);
    highlightRef.current = lines;
  };

  // Sync scene nodes -> meshes (rebuild on every change for simplicity)
  useEffect(() => {
    const group = groupRef.current; const transform = transformRef.current;
    if (!group || !transform) return;
    transform.detach();
    for (const m of group.children) {
      (m as THREE.Mesh).geometry?.dispose?.();
      ((m as THREE.Mesh).material as THREE.Material)?.dispose?.();
    }
    group.clear();
    meshesRef.current.clear();
    for (const node of scene.nodes) {
      if (!node.visible) continue;
      const mesh = buildMesh(node);
      group.add(mesh);
      meshesRef.current.set(node.id, mesh);
    }
    if (selectedId) {
      const m = meshesRef.current.get(selectedId);
      if (m && !m.userData.locked && mode !== 'select') transform.attach(m);
    }
    updateHighlight();
  }, [scene]);

  // Selection or mode changed
  useEffect(() => {
    const transform = transformRef.current;
    if (!transform) return;
    if (selectedId && mode !== 'select') {
      const m = meshesRef.current.get(selectedId);
      if (m && !m.userData.locked) transform.attach(m);
      else transform.detach();
    } else transform.detach();
    updateHighlight();
  }, [selectedId, mode]);

  useEffect(() => {
    if (!transformRef.current) return;
    if (mode === 'select') transformRef.current.detach();
    else transformRef.current.setMode(mode);
  }, [mode]);
  useEffect(() => { snapRef.current = snap; }, [snap]);
  useEffect(() => { sceneNodesRef.current = scene.nodes; }, [scene]);
  useEffect(() => {
    const grid = sceneRef.current?.getObjectByName('grid');
    if (grid) grid.visible = showGrid;
  }, [showGrid]);

  // Keyboard shortcuts (only when viewer is hovered/focused — bind to mount)
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'g') { setMode('translate'); }
      else if (k === 'r') { setMode('rotate'); }
      else if (k === 's' && !e.ctrlKey && !e.metaKey) { setMode('scale'); }
      else if (k === 'q') { setMode('select'); }
      else if (k === 'f') { setView('fit'); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current) {
        e.preventDefault();
        onDeleteRef.current?.(selectedIdRef.current);
      }
      else if ((e.ctrlKey || e.metaKey) && k === 'd' && selectedIdRef.current) {
        e.preventDefault();
        onDuplicateRef.current?.(selectedIdRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const screenshot = () => {
    const r = rendererRef.current, s = sceneRef.current, c = cameraRef.current;
    if (!r || !s || !c) return;
    r.render(s, c);
    try {
      const url = r.domElement.toDataURL('image/png');
      onScreenshot?.(url);
      const a = document.createElement('a');
      a.href = url; a.download = 'scene.png'; a.click();
    } catch {}
  };

  const closeMenu = () => setCtxMenu(null);
  const menuItem = (label: string, fn: () => void, danger = false) => (
    <button
      className={`w-full text-left px-2 py-1 text-xs hover:bg-accent/30 ${danger ? 'text-destructive' : ''}`}
      onClick={() => { fn(); closeMenu(); }}
    >{label}</button>
  );

  return (
    <div className="relative w-full h-full" onClick={() => ctxMenu && setCtxMenu(null)}>
      <div ref={mountRef} className="w-full h-full" />

      {/* Tool mode toolbar */}
      <div className="absolute top-2 left-2 flex gap-1 bg-background/70 backdrop-blur p-1 rounded border border-border">
        <Button size="icon" variant={mode === 'select' ? 'default' : 'ghost'} className="h-7 w-7" title="Select (Q)" onClick={() => setMode('select')}>
          <MousePointer2 className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={mode === 'translate' ? 'default' : 'ghost'} className="h-7 w-7" title="Move (G)" onClick={() => setMode('translate')}>
          <Move className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={mode === 'rotate' ? 'default' : 'ghost'} className="h-7 w-7" title="Rotate (R)" onClick={() => setMode('rotate')}>
          <RotateCw className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={mode === 'scale' ? 'default' : 'ghost'} className="h-7 w-7" title="Scale (S)" onClick={() => setMode('scale')}>
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={snap ? 'default' : 'ghost'} className="h-7 w-7" title="Snap to grid (1mm / 15°)" onClick={() => setSnap(s => !s)}>
          <Magnet className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={showGrid ? 'default' : 'ghost'} className="h-7 w-7" title="Grid" onClick={() => setShowGrid(g => !g)}>
          <Grid3x3 className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Frame selected (F)" onClick={() => setView('fit')}>
          <Crosshair className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Screenshot" onClick={screenshot}>
          <Camera className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Camera preset buttons */}
      <div className="absolute top-2 right-2 flex gap-1 bg-background/70 backdrop-blur p-1 rounded border border-border">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setView('top')}>Top</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setView('front')}>Front</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setView('right')}>Right</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setView('iso')}>Iso</Button>
      </div>

      <div className="absolute bottom-2 left-2 text-[10px] font-mono text-muted-foreground bg-background/70 backdrop-blur px-2 py-1 rounded border border-border">
        Click to select · G/R/S move/rotate/scale · F frame · Del delete · Ctrl+D duplicate · right-click for menu
        <span className="ml-2 opacity-60">(approximate proxy mesh — final geometry is from OpenSCAD)</span>
      </div>
      {snapHints.length > 0 && (
        <div className="absolute top-12 right-2 text-[10px] font-mono bg-accent/30 text-accent-foreground border border-accent/60 backdrop-blur px-2 py-1 rounded shadow-lg pointer-events-none">
          <div className="font-semibold mb-0.5">SNAP</div>
          {snapHints.slice(0, 4).map((h, i) => <div key={i}>• {h}</div>)}
        </div>
      )}

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          className="absolute z-50 min-w-[150px] rounded-md border border-border bg-popover shadow-lg py-1"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuItem('Duplicate (Ctrl+D)', () => onDuplicateRef.current?.(ctxMenu.nodeId))}
          {menuItem('Frame (F)', () => setView('fit'))}
          <div className="my-1 h-px bg-border" />
          {menuItem('Set as Union (+)', () => onSetOp?.(ctxMenu.nodeId, 'union'))}
          {menuItem('Set as Hole (−)', () => onSetOp?.(ctxMenu.nodeId, 'difference'))}
          {menuItem('Intersection (∩)', () => onSetOp?.(ctxMenu.nodeId, 'intersection'))}
          <div className="my-1 h-px bg-border" />
          {menuItem('Delete', () => onDeleteRef.current?.(ctxMenu.nodeId), true)}
        </div>
      )}
    </div>
  );
}
