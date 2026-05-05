// Parametric scene model for the visual CAD workspace.
// A scene is an ordered list of operations (primitives, holes, booleans).
// Serializing a scene produces valid OpenSCAD code.

export type ShapeKind =
  | 'cube'
  | 'rounded_box'
  | 'cylinder'
  | 'cone'
  | 'sphere'
  | 'tube'
  | 'text'
  | 'screw_hole'
  | 'mounting_bracket'
  | 'rc_wheel'
  | 'servo_mount';

export type Op = 'union' | 'difference' | 'intersection';

export interface SceneNode {
  id: string;
  name: string;
  kind: ShapeKind;
  op: Op;            // how this node combines with the running model. 'difference' = subtract / hole.
  visible: boolean;
  params: Record<string, number | string>;
  pos: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number };
}

export interface Scene {
  nodes: SceneNode[];
  fn: number;
}

export const DEFAULT_FN = 64;

let nextId = 1;
export function newId(prefix = 'n'): string {
  nextId += 1;
  return `${prefix}_${Date.now().toString(36)}_${nextId}`;
}

export interface ShapeDef {
  kind: ShapeKind;
  label: string;
  defaults: Record<string, number | string>;
  // Which fields to expose in the property panel.
  fields: { key: string; label: string; type: 'number' | 'text'; step?: number; min?: number }[];
  toScad: (params: Record<string, number | string>) => string;
}

const num = (v: number | string | undefined, d: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : d;
};
const str = (v: number | string | undefined, d: string) => (typeof v === 'string' ? v : String(v ?? d));

export const SHAPE_DEFS: Record<ShapeKind, ShapeDef> = {
  cube: {
    kind: 'cube',
    label: 'Box',
    defaults: { width: 20, depth: 20, height: 20 },
    fields: [
      { key: 'width', label: 'Width (X)', type: 'number', step: 0.5, min: 0.1 },
      { key: 'depth', label: 'Depth (Y)', type: 'number', step: 0.5, min: 0.1 },
      { key: 'height', label: 'Height (Z)', type: 'number', step: 0.5, min: 0.1 },
    ],
    toScad: (p) => `cube([${num(p.width, 20)}, ${num(p.depth, 20)}, ${num(p.height, 20)}], center=true);`,
  },
  rounded_box: {
    kind: 'rounded_box',
    label: 'Rounded Box',
    defaults: { width: 30, depth: 20, height: 10, radius: 2 },
    fields: [
      { key: 'width', label: 'Width', type: 'number', step: 0.5 },
      { key: 'depth', label: 'Depth', type: 'number', step: 0.5 },
      { key: 'height', label: 'Height', type: 'number', step: 0.5 },
      { key: 'radius', label: 'Corner radius', type: 'number', step: 0.1, min: 0.1 },
    ],
    toScad: (p) => {
      const w = num(p.width, 30), d = num(p.depth, 20), h = num(p.height, 10), r = Math.min(num(p.radius, 2), Math.min(w, d, h) / 2 - 0.01);
      return `minkowski(){ cube([${w - 2 * r}, ${d - 2 * r}, ${h - 2 * r}], center=true); sphere(r=${r}); }`;
    },
  },
  cylinder: {
    kind: 'cylinder',
    label: 'Cylinder',
    defaults: { diameter: 20, height: 20 },
    fields: [
      { key: 'diameter', label: 'Diameter', type: 'number', step: 0.5, min: 0.1 },
      { key: 'height', label: 'Height', type: 'number', step: 0.5, min: 0.1 },
    ],
    toScad: (p) => `cylinder(h=${num(p.height, 20)}, d=${num(p.diameter, 20)}, center=true);`,
  },
  cone: {
    kind: 'cone',
    label: 'Cone',
    defaults: { diameter1: 20, diameter2: 0, height: 20 },
    fields: [
      { key: 'diameter1', label: 'Bottom Ø', type: 'number', step: 0.5 },
      { key: 'diameter2', label: 'Top Ø', type: 'number', step: 0.5 },
      { key: 'height', label: 'Height', type: 'number', step: 0.5 },
    ],
    toScad: (p) => `cylinder(h=${num(p.height, 20)}, d1=${num(p.diameter1, 20)}, d2=${num(p.diameter2, 0)}, center=true);`,
  },
  sphere: {
    kind: 'sphere',
    label: 'Sphere',
    defaults: { diameter: 20 },
    fields: [{ key: 'diameter', label: 'Diameter', type: 'number', step: 0.5, min: 0.1 }],
    toScad: (p) => `sphere(d=${num(p.diameter, 20)});`,
  },
  tube: {
    kind: 'tube',
    label: 'Tube / Ring',
    defaults: { outerDiameter: 20, innerDiameter: 14, height: 10 },
    fields: [
      { key: 'outerDiameter', label: 'Outer Ø', type: 'number', step: 0.5 },
      { key: 'innerDiameter', label: 'Inner Ø', type: 'number', step: 0.5 },
      { key: 'height', label: 'Height', type: 'number', step: 0.5 },
    ],
    toScad: (p) => {
      const od = num(p.outerDiameter, 20), id = num(p.innerDiameter, 14), h = num(p.height, 10);
      return `difference(){ cylinder(h=${h}, d=${od}, center=true); cylinder(h=${h + 1}, d=${id}, center=true); }`;
    },
  },
  text: {
    kind: 'text',
    label: 'Text',
    defaults: { content: 'Hello', size: 8, height: 2 },
    fields: [
      { key: 'content', label: 'Text', type: 'text' },
      { key: 'size', label: 'Size', type: 'number', step: 0.5 },
      { key: 'height', label: 'Extrude depth', type: 'number', step: 0.5 },
    ],
    toScad: (p) =>
      `linear_extrude(height=${num(p.height, 2)}) text("${str(p.content, 'Hello').replace(/"/g, '\\"')}", size=${num(p.size, 8)}, halign="center", valign="center");`,
  },
  screw_hole: {
    kind: 'screw_hole',
    label: 'Screw Hole',
    defaults: { diameter: 3.2, depth: 20 },
    fields: [
      { key: 'diameter', label: 'Hole Ø (mm)', type: 'number', step: 0.1 },
      { key: 'depth', label: 'Depth', type: 'number', step: 0.5 },
    ],
    toScad: (p) => `cylinder(h=${num(p.depth, 20)}, d=${num(p.diameter, 3.2)}, center=true);`,
  },
  mounting_bracket: {
    kind: 'mounting_bracket',
    label: 'Mounting Bracket',
    defaults: { width: 40, height: 40, thickness: 3, holeDiameter: 4 },
    fields: [
      { key: 'width', label: 'Leg width', type: 'number', step: 0.5 },
      { key: 'height', label: 'Leg height', type: 'number', step: 0.5 },
      { key: 'thickness', label: 'Wall thickness', type: 'number', step: 0.5 },
      { key: 'holeDiameter', label: 'Hole Ø', type: 'number', step: 0.1 },
    ],
    toScad: (p) => {
      const w = num(p.width, 40), h = num(p.height, 40), t = num(p.thickness, 3), d = num(p.holeDiameter, 4);
      return `difference(){
  union(){
    translate([0,0,t/2]) cube([w,t,t], center=true);
    translate([0,t/2 - t/2,h/2]) cube([w,t,h], center=true);
  }
  for (x=[-w/3, w/3]){
    translate([x, 0, t/2]) rotate([90,0,0]) cylinder(h=t*3, d=${d}, center=true);
    translate([x, 0, h - ${d}]) rotate([90,0,0]) cylinder(h=t*3, d=${d}, center=true);
  }
}`.replace(/\bw\b/g, String(w)).replace(/\bh\b/g, String(h)).replace(/\bt\b/g, String(t));
    },
  },
  rc_wheel: {
    kind: 'rc_wheel',
    label: 'RC Wheel',
    defaults: { diameter: 60, width: 24, hubDiameter: 12, hubHeight: 8 },
    fields: [
      { key: 'diameter', label: 'Wheel Ø', type: 'number', step: 1 },
      { key: 'width', label: 'Tread width', type: 'number', step: 0.5 },
      { key: 'hubDiameter', label: 'Hub Ø', type: 'number', step: 0.5 },
      { key: 'hubHeight', label: 'Hub depth', type: 'number', step: 0.5 },
    ],
    toScad: (p) => {
      const d = num(p.diameter, 60), w = num(p.width, 24), hd = num(p.hubDiameter, 12), hh = num(p.hubHeight, 8);
      return `difference(){
  union(){
    cylinder(h=${w}, d=${d}, center=true);
    cylinder(h=${w + hh}, d=${hd + 4}, center=true);
  }
  cylinder(h=${w + hh + 1}, d=${hd}, center=true);
}`;
    },
  },
  servo_mount: {
    kind: 'servo_mount',
    label: 'Servo Mount (SG90)',
    defaults: { length: 32.5, width: 12, height: 22.5, holeDiameter: 2.2 },
    fields: [
      { key: 'length', label: 'Servo length', type: 'number', step: 0.1 },
      { key: 'width', label: 'Servo width', type: 'number', step: 0.1 },
      { key: 'height', label: 'Servo height', type: 'number', step: 0.1 },
      { key: 'holeDiameter', label: 'Mount hole Ø', type: 'number', step: 0.1 },
    ],
    toScad: (p) => {
      const L = num(p.length, 32.5), W = num(p.width, 12), H = num(p.height, 22.5), d = num(p.holeDiameter, 2.2);
      return `difference(){
  cube([${L + 12}, ${W + 6}, 3], center=true);
  cube([${L}, ${W}, 4], center=true);
  for (x=[${-(L / 2 + 3)}, ${L / 2 + 3}]) translate([x, 0, 0]) cylinder(h=10, d=${d}, center=true);
}`;
    },
  },
};

export function createNode(kind: ShapeKind, op: Op = 'union'): SceneNode {
  const def = SHAPE_DEFS[kind];
  return {
    id: newId(kind),
    name: def.label,
    kind,
    op,
    visible: true,
    params: { ...def.defaults },
    pos: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0 },
  };
}

export function emptyScene(): Scene {
  return { nodes: [], fn: DEFAULT_FN };
}

function nodeToScad(n: SceneNode): string {
  const def = SHAPE_DEFS[n.kind];
  const body = def.toScad(n.params);
  const inner = `translate([${n.pos.x}, ${n.pos.y}, ${n.pos.z}]) rotate([${n.rot.x}, ${n.rot.y}, ${n.rot.z}]) { ${body} }`;
  return `// ${n.name} [${n.kind}]\n${inner}`;
}

export function sceneToScad(scene: Scene): string {
  const visible = scene.nodes.filter((n) => n.visible);
  if (!visible.length) return `$fn = ${scene.fn};\n// (empty scene — add a shape from the toolbox)\ncube([0.001, 0.001, 0.001]);`;

  // Group sequentially: start with first union node as base, then layer each op.
  // Implementation: wrap in nested difference/intersection blocks per op transition.
  const lines: string[] = [`$fn = ${scene.fn};`];

  const additive = visible.filter((n) => n.op === 'union');
  const subs = visible.filter((n) => n.op === 'difference');
  const ints = visible.filter((n) => n.op === 'intersection');

  if (!additive.length) {
    // fallback: wrap all as union
    lines.push('union() {');
    for (const n of visible) lines.push('  ' + nodeToScad(n).replace(/\n/g, '\n  '));
    lines.push('}');
    return lines.join('\n');
  }

  let body = `union() {\n${additive.map((n) => '  ' + nodeToScad(n).replace(/\n/g, '\n  ')).join('\n')}\n}`;
  if (subs.length) {
    body = `difference() {\n  ${body.replace(/\n/g, '\n  ')}\n${subs
      .map((n) => '  ' + nodeToScad(n).replace(/\n/g, '\n  '))
      .join('\n')}\n}`;
  }
  if (ints.length) {
    body = `intersection() {\n  ${body.replace(/\n/g, '\n  ')}\n${ints
      .map((n) => '  ' + nodeToScad(n).replace(/\n/g, '\n  '))
      .join('\n')}\n}`;
  }
  lines.push(body);
  return lines.join('\n');
}

// Project box / enclosure / etc — return ready-made scenes that immediately render.
export interface SceneTemplate {
  id: string;
  label: string;
  build: () => Scene;
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: 'project_box',
    label: 'Project Box',
    build: () => ({
      fn: DEFAULT_FN,
      nodes: [
        { ...createNode('rounded_box'), name: 'Body', params: { width: 80, depth: 60, height: 30, radius: 3 } },
        { ...createNode('rounded_box', 'difference'), name: 'Cavity', params: { width: 76, depth: 56, height: 28, radius: 2 }, pos: { x: 0, y: 0, z: 2 } },
      ],
    }),
  },
  {
    id: 'esp32_case',
    label: 'ESP32 Case',
    build: () => ({
      fn: DEFAULT_FN,
      nodes: [
        { ...createNode('rounded_box'), name: 'Shell', params: { width: 60, depth: 35, height: 20, radius: 2 } },
        { ...createNode('rounded_box', 'difference'), name: 'Cavity', params: { width: 56, depth: 31, height: 18, radius: 1.5 }, pos: { x: 0, y: 0, z: 2 } },
        { ...createNode('cube', 'difference'), name: 'USB slot', params: { width: 10, depth: 10, height: 5 }, pos: { x: -25, y: 0, z: 5 } },
      ],
    }),
  },
  {
    id: 'rc_wheel_template',
    label: 'RC Wheel',
    build: () => ({ fn: DEFAULT_FN, nodes: [createNode('rc_wheel')] }),
  },
  {
    id: 'servo_bracket',
    label: 'Servo Bracket',
    build: () => ({ fn: DEFAULT_FN, nodes: [createNode('servo_mount')] }),
  },
  {
    id: 'motor_mount',
    label: 'Motor Mount',
    build: () => ({
      fn: DEFAULT_FN,
      nodes: [
        { ...createNode('cube'), name: 'Plate', params: { width: 40, depth: 40, height: 4 } },
        { ...createNode('tube'), name: 'Boss', params: { outerDiameter: 28, innerDiameter: 22, height: 10 }, pos: { x: 0, y: 0, z: 7 } },
        { ...createNode('screw_hole', 'difference'), name: 'Hole NE', params: { diameter: 3.2, depth: 10 }, pos: { x: 15, y: 15, z: 0 } },
        { ...createNode('screw_hole', 'difference'), name: 'Hole NW', params: { diameter: 3.2, depth: 10 }, pos: { x: -15, y: 15, z: 0 } },
        { ...createNode('screw_hole', 'difference'), name: 'Hole SE', params: { diameter: 3.2, depth: 10 }, pos: { x: 15, y: -15, z: 0 } },
        { ...createNode('screw_hole', 'difference'), name: 'Hole SW', params: { diameter: 3.2, depth: 10 }, pos: { x: -15, y: -15, z: 0 } },
      ],
    }),
  },
  {
    id: 'battery_tray',
    label: 'Battery Tray',
    build: () => ({
      fn: DEFAULT_FN,
      nodes: [
        { ...createNode('rounded_box'), name: 'Tray', params: { width: 80, depth: 40, height: 18, radius: 2 } },
        { ...createNode('cube', 'difference'), name: 'Slot', params: { width: 74, depth: 34, height: 16 }, pos: { x: 0, y: 0, z: 2 } },
      ],
    }),
  },
  {
    id: 'standoff',
    label: 'Screw Standoff',
    build: () => ({
      fn: DEFAULT_FN,
      nodes: [
        { ...createNode('tube'), name: 'Standoff', params: { outerDiameter: 8, innerDiameter: 3.2, height: 10 } },
      ],
    }),
  },
  {
    id: 'vented_lid',
    label: 'Vented Lid',
    build: () => {
      const nodes: SceneNode[] = [
        { ...createNode('rounded_box'), name: 'Lid', params: { width: 80, depth: 60, height: 3, radius: 2 } },
      ];
      for (let i = -3; i <= 3; i++) {
        nodes.push({ ...createNode('cube', 'difference'), name: `Vent ${i}`, params: { width: 2, depth: 40, height: 5 }, pos: { x: i * 8, y: 0, z: 0 } });
      }
      return { fn: DEFAULT_FN, nodes };
    },
  },
];
