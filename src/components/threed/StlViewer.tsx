import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface StlViewerInfo {
  bytes: number;
  vertices: number;
  bbox: { x: number; y: number; z: number } | null;
  error: string | null;
  empty: boolean;
}

interface StlViewerProps {
  stl?: ArrayBuffer | null;
  className?: string;
  onInfo?: (info: StlViewerInfo) => void;
}

export function StlViewer({ stl, className, onInfo }: StlViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<StlViewerInfo>({ bytes: 0, vertices: 0, bbox: null, error: null, empty: false });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(60, 60, 60);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(50, 80, 30);
    scene.add(dir);

    const grid = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    scene.add(grid);

    let mesh: THREE.Mesh | null = null;
    let nextInfo: StlViewerInfo = { bytes: stl?.byteLength || 0, vertices: 0, bbox: null, error: null, empty: false };
    if (stl) {
      try {
        const geometry = new STLLoader().parse(stl);
        const verts = geometry.getAttribute('position')?.count ?? 0;
        nextInfo.vertices = verts;
        if (verts === 0) {
          nextInfo.empty = true;
          nextInfo.error = 'STL exported but mesh is empty.';
        } else {
          geometry.computeBoundingBox();
          const bb = geometry.boundingBox;
          if (bb) {
            const size = new THREE.Vector3();
            bb.getSize(size);
            nextInfo.bbox = { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2) };
          }
          geometry.center();
          const material = new THREE.MeshStandardMaterial({ color: 0x7c5cff, metalness: 0.1, roughness: 0.6 });
          mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          geometry.computeBoundingSphere();
          const r = geometry.boundingSphere?.radius || 30;
          camera.position.set(r * 2, r * 2, r * 2);
          controls.target.set(0, 0, 0);
          controls.update();
        }
      } catch (e) {
        nextInfo.error = e instanceof Error ? e.message : 'STL parse failed';
        console.error('STL parse failed', e);
      }
    }
    setInfo(nextInfo);
    onInfo?.(nextInfo);

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
      if (mesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      mount.removeChild(renderer.domElement);
    };
  }, [stl]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className={className} style={{ width: '100%', height: '100%' }} />
      <div className="absolute top-2 left-2 text-[10px] font-mono bg-background/70 backdrop-blur px-2 py-1 rounded border border-border space-y-0.5 pointer-events-none">
        <div>bytes: <span className="text-accent">{info.bytes.toLocaleString()}</span></div>
        <div>verts: <span className="text-accent">{info.vertices.toLocaleString()}</span></div>
        <div>bbox: <span className="text-accent">{info.bbox ? `${info.bbox.x} × ${info.bbox.y} × ${info.bbox.z}` : '—'}</span></div>
      </div>
      {info.error && (
        <div className="absolute inset-x-2 bottom-2 text-xs font-mono bg-destructive/15 border border-destructive/40 text-destructive px-3 py-2 rounded">
          {info.error}
        </div>
      )}
    </div>
  );
}
