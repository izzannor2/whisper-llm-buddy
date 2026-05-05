import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Button } from '@/components/ui/button';
import {
  RotateCcw, Maximize2, RefreshCw, Box as BoxIcon, Grid3x3, Move3d, Eye, Camera,
} from 'lucide-react';

export interface StlViewerInfo {
  bytes: number;
  vertices: number;
  triangles: number;
  bbox: { x: number; y: number; z: number } | null;
  volumeMm3: number | null;
  error: string | null;
  empty: boolean;
}

interface StlViewerProps {
  stl?: ArrayBuffer | null;
  className?: string;
  onInfo?: (info: StlViewerInfo) => void;
}

function computeVolume(geom: THREE.BufferGeometry): number {
  const pos = geom.getAttribute('position');
  if (!pos) return 0;
  let sum = 0;
  const idx = geom.getIndex();
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < triCount; i++) {
    const ia = idx ? idx.getX(i * 3) : i * 3;
    const ib = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
    const ic = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    sum += a.dot(b.clone().cross(c)) / 6;
  }
  return Math.abs(sum);
}

export function StlViewer({ stl, className, onInfo }: StlViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const radiusRef = useRef(60);

  const [info, setInfo] = useState<StlViewerInfo>({
    bytes: 0, vertices: 0, triangles: 0, bbox: null, volumeMm3: null, error: null, empty: false,
  });
  const [wireframe, setWireframe] = useState(false);
  const [shaded, setShaded] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  // Mount scene once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(60, 60, 60);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(50, 80, 30);
    scene.add(dir);

    const grid = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    scene.add(grid);
    gridRef.current = grid;

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.dispose();
      if (meshRef.current) {
        meshRef.current.geometry.dispose();
        (meshRef.current.material as THREE.Material).dispose();
      }
      try { mount.removeChild(renderer.domElement); } catch {}
    };
  }, []);

  // Load STL when it changes
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) return;

    // remove previous mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
      meshRef.current = null;
    }

    const next: StlViewerInfo = {
      bytes: stl?.byteLength || 0, vertices: 0, triangles: 0,
      bbox: null, volumeMm3: null, error: null, empty: false,
    };

    if (stl) {
      try {
        const geometry = new STLLoader().parse(stl);
        const verts = geometry.getAttribute('position')?.count ?? 0;
        next.vertices = verts;
        next.triangles = Math.floor(verts / 3);
        if (verts === 0) {
          next.empty = true;
          next.error = 'STL exported but mesh is empty.';
        } else {
          geometry.computeBoundingBox();
          const bb = geometry.boundingBox;
          if (bb) {
            const size = new THREE.Vector3();
            bb.getSize(size);
            next.bbox = { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2) };
          }
          try { next.volumeMm3 = +computeVolume(geometry).toFixed(2); } catch {}
          geometry.center();
          const material = shaded
            ? new THREE.MeshStandardMaterial({ color: 0x7c5cff, metalness: 0.1, roughness: 0.6, wireframe })
            : new THREE.MeshBasicMaterial({ color: 0x7c5cff, wireframe });
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          meshRef.current = mesh;
          geometry.computeBoundingSphere();
          const r = geometry.boundingSphere?.radius || 30;
          radiusRef.current = r;
          camera.position.set(r * 2, r * 2, r * 2);
          controls.target.set(0, 0, 0);
          controls.update();
        }
      } catch (e) {
        next.error = e instanceof Error ? e.message : 'STL parse failed';
        console.error('STL parse failed', e);
      }
    }
    setInfo(next);
    onInfo?.(next);
  }, [stl]);

  // Toggle reactivity
  useEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    const old = m.material as THREE.Material;
    const mat = shaded
      ? new THREE.MeshStandardMaterial({ color: 0x7c5cff, metalness: 0.1, roughness: 0.6, wireframe })
      : new THREE.MeshBasicMaterial({ color: 0x7c5cff, wireframe });
    m.material = mat;
    old.dispose();
  }, [wireframe, shaded]);

  useEffect(() => { if (gridRef.current) gridRef.current.visible = showGrid; }, [showGrid]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (showAxes && !axesRef.current) {
      const axes = new THREE.AxesHelper(Math.max(50, radiusRef.current * 1.2));
      scene.add(axes);
      axesRef.current = axes;
    } else if (!showAxes && axesRef.current) {
      scene.remove(axesRef.current);
      axesRef.current.dispose();
      axesRef.current = null;
    }
  }, [showAxes]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  const resetCamera = () => {
    const c = cameraRef.current; const ctrl = controlsRef.current;
    if (!c || !ctrl) return;
    const r = radiusRef.current || 60;
    c.position.set(r * 2, r * 2, r * 2);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  };

  const fitToModel = () => {
    const m = meshRef.current; const c = cameraRef.current; const ctrl = controlsRef.current;
    if (!m || !c || !ctrl) return;
    m.geometry.computeBoundingSphere();
    const r = m.geometry.boundingSphere?.radius || 60;
    radiusRef.current = r;
    const dist = r / Math.sin((c.fov * Math.PI) / 360);
    c.position.set(dist, dist, dist);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className={className} style={{ width: '100%', height: '100%' }} />

      {/* info overlay */}
      <div className="absolute top-2 left-2 text-[10px] font-mono bg-background/70 backdrop-blur px-2 py-1 rounded border border-border space-y-0.5 pointer-events-none">
        <div>bytes: <span className="text-accent">{info.bytes.toLocaleString()}</span></div>
        <div>verts: <span className="text-accent">{info.vertices.toLocaleString()}</span></div>
        <div>tris: <span className="text-accent">{info.triangles.toLocaleString()}</span></div>
        <div>bbox: <span className="text-accent">{info.bbox ? `${info.bbox.x} × ${info.bbox.y} × ${info.bbox.z}` : '—'}</span></div>
        {info.volumeMm3 != null && (
          <div>vol: <span className="text-accent">{(info.volumeMm3 / 1000).toFixed(2)} cm³</span></div>
        )}
      </div>

      {/* controls */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 bg-background/70 backdrop-blur p-1 rounded border border-border">
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Reset camera" onClick={resetCamera}>
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Fit to model" onClick={fitToModel}>
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={autoRotate ? 'default' : 'ghost'} className="h-7 w-7" title="Auto-rotate" onClick={() => setAutoRotate(v => !v)}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={wireframe ? 'default' : 'ghost'} className="h-7 w-7" title="Wireframe" onClick={() => setWireframe(v => !v)}>
          <BoxIcon className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={shaded ? 'default' : 'ghost'} className="h-7 w-7" title="Shaded / flat" onClick={() => setShaded(v => !v)}>
          <Eye className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={showGrid ? 'default' : 'ghost'} className="h-7 w-7" title="Grid" onClick={() => setShowGrid(v => !v)}>
          <Grid3x3 className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant={showAxes ? 'default' : 'ghost'} className="h-7 w-7" title="Axes" onClick={() => setShowAxes(v => !v)}>
          <Move3d className="w-3.5 h-3.5" />
        </Button>
      </div>

      {info.error && (
        <div className="absolute inset-x-2 bottom-2 text-xs font-mono bg-destructive/15 border border-destructive/40 text-destructive px-3 py-2 rounded">
          {info.error}
        </div>
      )}
    </div>
  );
}
