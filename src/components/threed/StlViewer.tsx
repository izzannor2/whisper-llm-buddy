import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface StlViewerProps {
  stl?: ArrayBuffer | null;
  className?: string;
}

export function StlViewer({ stl, className }: StlViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);

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
    if (stl) {
      try {
        const geometry = new STLLoader().parse(stl);
        geometry.center();
        const material = new THREE.MeshStandardMaterial({ color: 0x7c5cff, metalness: 0.1, roughness: 0.6 });
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        // Frame the model
        geometry.computeBoundingSphere();
        const r = geometry.boundingSphere?.radius || 30;
        camera.position.set(r * 2, r * 2, r * 2);
        controls.target.set(0, 0, 0);
        controls.update();
      } catch (e) {
        console.error('STL parse failed', e);
      }
    }

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

  return <div ref={mountRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
