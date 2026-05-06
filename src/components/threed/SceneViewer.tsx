import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Button } from '@/components/ui/button';
import { Move, RotateCw, Maximize2, Magnet, Grid3x3, Camera } from 'lucide-react';
import type { Scene, SceneNode } from '@/lib/threed-scene';

const SNAP_TOL = 2.0; // mm — distance under which a soft snap engages
const GUIDE_COLOR = { center: 0x5cffd1, face: 0xffd166, axis: 0x7c5cff };

interface Props {
  scene: Scene;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<SceneNode>) => void;
  onScreenshot?: (dataUrl: string) => void;
}

type Mode = 'translate' | 'rotate' | 'scale';

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
      // approximate proxy box
      geom = new THREE.BoxGeometry(num('width', 30), num('height', 20), num('depth', 20));
  }
  const isSub = node.op === 'difference';
  const mat = new THREE.MeshStandardMaterial({
    color: MAT_OP[node.op],
    metalness: 0.1,
    roughness: 0.6,
    transparent: isSub,
    opacity: isSub ? 0.55 : 1,
    wireframe: false,
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
  return mesh;
}

function snapValue(v: number, step: number) {
  if (!step) return v;
  return Math.round(v / step) * step;
}

export function SceneViewer({ scene, selectedId, onSelect, onUpdate, onScreenshot }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const groupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const onUpdateRef = useRef(onUpdate);
  const onSelectRef = useRef(onSelect);

  const [mode, setMode] = useState<Mode>('translate');
  const [snap, setSnap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

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

    const transform = new TransformControls(camera, renderer.domElement);
    transform.addEventListener('dragging-changed', (e: any) => { orbit.enabled = !e.value; });
    transform.addEventListener('objectChange', () => {
      const obj = transform.object as THREE.Mesh | undefined;
      if (!obj) return;
      const id = obj.userData.nodeId as string;
      if (snap && transform.mode === 'translate') {
        obj.position.x = snapValue(obj.position.x, 1);
        obj.position.y = snapValue(obj.position.y, 1);
        obj.position.z = snapValue(obj.position.z, 1);
      }
      if (snap && transform.mode === 'rotate') {
        const step = (15 * Math.PI) / 180;
        obj.rotation.x = snapValue(obj.rotation.x, step);
        obj.rotation.y = snapValue(obj.rotation.y, step);
        obj.rotation.z = snapValue(obj.rotation.z, step);
      }
    });
    transform.addEventListener('mouseUp', () => {
      const obj = transform.object as THREE.Mesh | undefined;
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

    // Click-pick
    const onPointerDown = (ev: PointerEvent) => {
      if ((ev.target as HTMLElement) !== renderer.domElement) return;
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
      transform.dispose();
      renderer.dispose();
      try { mount.removeChild(renderer.domElement); } catch {}
    };
  }, []);

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
      if (m) transform.attach(m);
    }
  }, [scene]);

  // Selection changed externally
  useEffect(() => {
    const transform = transformRef.current;
    if (!transform) return;
    if (selectedId) {
      const m = meshesRef.current.get(selectedId);
      if (m) transform.attach(m); else transform.detach();
    } else transform.detach();
  }, [selectedId]);

  useEffect(() => { transformRef.current?.setMode(mode); }, [mode]);
  useEffect(() => {
    const grid = sceneRef.current?.getObjectByName('grid');
    if (grid) grid.visible = showGrid;
  }, [showGrid]);

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

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute top-2 left-2 flex gap-1 bg-background/70 backdrop-blur p-1 rounded border border-border">
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
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Screenshot" onClick={screenshot}>
          <Camera className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="absolute bottom-2 left-2 text-[10px] font-mono text-muted-foreground bg-background/70 backdrop-blur px-2 py-1 rounded border border-border">
        Click to select · drag gizmo to move/rotate/scale · changes regenerate SCAD
        <span className="ml-2 opacity-60">(approximate proxy mesh — final geometry is from OpenSCAD)</span>
      </div>
    </div>
  );
}
