import type { SceneNode } from './threed-scene';

// Approximate axis-aligned half-extent of a node in its local frame.
// Real OpenSCAD geometry may differ; this is an estimate using primitive params.
function halfExtent(n: SceneNode): { x: number; y: number; z: number } {
  const p = n.params;
  const num = (k: string, d: number) => {
    const v = p[k]; const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(x) ? x : d;
  };
  const sx = n.scale?.x ?? 1, sy = n.scale?.y ?? 1, sz = n.scale?.z ?? 1;
  switch (n.kind) {
    case 'cube':
    case 'rounded_box':
      return { x: (num('width', 20) / 2) * sx, y: (num('depth', 20) / 2) * sy, z: (num('height', 20) / 2) * sz };
    case 'cylinder':
    case 'screw_hole':
      return { x: (num('diameter', 20) / 2) * sx, y: (num('diameter', 20) / 2) * sy, z: (num('height', 20) / 2) * sz };
    case 'cone':
      return { x: (num('diameter1', 20) / 2) * sx, y: (num('diameter1', 20) / 2) * sy, z: (num('height', 20) / 2) * sz };
    case 'sphere':
      return { x: (num('diameter', 20) / 2) * sx, y: (num('diameter', 20) / 2) * sy, z: (num('diameter', 20) / 2) * sz };
    case 'tube':
      return { x: (num('outerDiameter', 20) / 2) * sx, y: (num('outerDiameter', 20) / 2) * sy, z: (num('height', 10) / 2) * sz };
    default:
      return { x: 15 * sx, y: 15 * sy, z: 15 * sz };
  }
}

export function snapCenterToCenter(target: SceneNode, ref: SceneNode): Partial<SceneNode> {
  return { pos: { ...ref.pos } };
}

export function snapAlignAxis(target: SceneNode, ref: SceneNode, axis: 'x' | 'y' | 'z'): Partial<SceneNode> {
  return { pos: { ...target.pos, [axis]: ref.pos[axis] } };
}

// Snap target's face to ref's opposite face along axis (e.g. axis='x' places target.+X face on ref.-X face).
export function snapFaceToFace(target: SceneNode, ref: SceneNode, axis: 'x' | 'y' | 'z', side: 1 | -1 = 1): Partial<SceneNode> {
  const ht = halfExtent(target);
  const hr = halfExtent(ref);
  const offset = (axis === 'x' ? hr.x + ht.x : axis === 'y' ? hr.y + ht.y : hr.z + ht.z) * side;
  return { pos: { ...target.pos, [axis]: ref.pos[axis] + offset } };
}
