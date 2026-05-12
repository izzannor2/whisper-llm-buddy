// MakerLab-style parametric generators.
// Each generator returns a real Scene that emits valid OpenSCAD via sceneToScad,
// so visual editing keeps working after insertion. No fake STL, no opaque blobs.

import { createNode, emptyScene, DEFAULT_FN, type Scene, type SceneNode } from './threed-scene';

export type FieldKind = 'number' | 'text' | 'select';
export interface GenField {
  key: string;
  label: string;
  kind: FieldKind;
  default: number | string;
  step?: number;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  hint?: string;
}
export interface MakerLabGenerator {
  id: string;
  label: string;
  description: string;
  category: 'utility' | 'enclosure' | 'mechanical' | 'decorative' | 'reference';
  fields: GenField[];
  build: (params: Record<string, number | string>) => Scene;
  // True when this generator can't be fully realised offline and must
  // surface a "guidance only" notice (e.g. image-to-mesh).
  guidanceOnly?: boolean;
  guidanceNote?: string;
}

const n = (v: number | string | undefined, d: number) => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : d;
};
const s = (v: number | string | undefined, d: string) => (v == null ? d : String(v));

function scene(nodes: SceneNode[]): Scene {
  return { fn: DEFAULT_FN, nodes };
}

export const MAKERLAB_GENERATORS: MakerLabGenerator[] = [
  // --- Decorative ---------------------------------------------------------
  {
    id: 'text_3d',
    label: 'Text to 3D',
    description: 'Extruded text plate. Edit the size, depth and font in the inspector.',
    category: 'decorative',
    fields: [
      { key: 'content', label: 'Text', kind: 'text', default: 'Hello' },
      { key: 'size', label: 'Letter size (mm)', kind: 'number', default: 12, step: 0.5, min: 1 },
      { key: 'height', label: 'Extrude depth (mm)', kind: 'number', default: 3, step: 0.5, min: 0.4 },
    ],
    build: (p) => scene([
      { ...createNode('text'), name: 'Text', params: { content: s(p.content, 'Hello'), size: n(p.size, 12), height: n(p.height, 3) } },
    ]),
  },
  {
    id: 'sign',
    label: 'Sign',
    description: 'Rounded plate with raised text — door sign, name plate, marker.',
    category: 'decorative',
    fields: [
      { key: 'content', label: 'Text', kind: 'text', default: 'WELCOME' },
      { key: 'width', label: 'Plate width (mm)', kind: 'number', default: 80, step: 1 },
      { key: 'height', label: 'Plate height (mm)', kind: 'number', default: 30, step: 1 },
      { key: 'thickness', label: 'Plate thickness (mm)', kind: 'number', default: 3, step: 0.5 },
      { key: 'textSize', label: 'Text size (mm)', kind: 'number', default: 12, step: 0.5 },
      { key: 'textDepth', label: 'Text raise (mm)', kind: 'number', default: 1.5, step: 0.1 },
    ],
    build: (p) => scene([
      { ...createNode('rounded_box'), name: 'Plate', params: { width: n(p.width, 80), depth: n(p.height, 30), height: n(p.thickness, 3), radius: 2 } },
      { ...createNode('text'), name: 'Label', params: { content: s(p.content, 'WELCOME'), size: n(p.textSize, 12), height: n(p.textDepth, 1.5) },
        pos: { x: 0, y: 0, z: n(p.thickness, 3) / 2 + n(p.textDepth, 1.5) / 2 } },
    ]),
  },
  {
    id: 'keychain',
    label: 'Keychain',
    description: 'Rounded tag with raised text and a hole for the ring.',
    category: 'decorative',
    fields: [
      { key: 'content', label: 'Text', kind: 'text', default: 'NAME' },
      { key: 'width', label: 'Tag width (mm)', kind: 'number', default: 50, step: 1 },
      { key: 'height', label: 'Tag height (mm)', kind: 'number', default: 22, step: 1 },
      { key: 'thickness', label: 'Thickness (mm)', kind: 'number', default: 3, step: 0.5 },
      { key: 'textSize', label: 'Text size (mm)', kind: 'number', default: 8, step: 0.5 },
      { key: 'holeDiameter', label: 'Ring hole Ø (mm)', kind: 'number', default: 4, step: 0.1 },
    ],
    build: (p) => {
      const w = n(p.width, 50), h = n(p.height, 22), t = n(p.thickness, 3);
      return scene([
        { ...createNode('rounded_box'), name: 'Tag', params: { width: w, depth: h, height: t, radius: 3 } },
        { ...createNode('text'), name: 'Label', params: { content: s(p.content, 'NAME'), size: n(p.textSize, 8), height: 1.2 },
          pos: { x: -3, y: 0, z: t / 2 + 0.6 } },
        { ...createNode('cylinder', 'difference'), name: 'Ring hole', params: { diameter: n(p.holeDiameter, 4), height: t + 1 },
          pos: { x: -w / 2 + 5, y: 0, z: 0 } },
      ]);
    },
  },
  {
    id: 'lithophane',
    label: 'Lithophane (placeholder plate)',
    description: 'A thin printable plate sized for a lithophane. True image-to-height requires an image processor — drop in a reference image to guide the AI.',
    category: 'decorative',
    guidanceOnly: true,
    guidanceNote: 'Reference image will guide editable CAD/OpenSCAD generation. No automatic depth-map yet.',
    fields: [
      { key: 'width', label: 'Width (mm)', kind: 'number', default: 100, step: 1 },
      { key: 'height', label: 'Height (mm)', kind: 'number', default: 70, step: 1 },
      { key: 'minThickness', label: 'Min thickness (mm)', kind: 'number', default: 0.8, step: 0.1 },
      { key: 'maxThickness', label: 'Max thickness (mm)', kind: 'number', default: 3.2, step: 0.1 },
    ],
    build: (p) => scene([
      { ...createNode('cube'), name: 'Lithophane plate', params: { width: n(p.width, 100), depth: n(p.height, 70), height: n(p.maxThickness, 3.2) } },
    ]),
  },
  {
    id: 'cookie_cutter',
    label: 'Cookie Cutter',
    description: 'Outer wall + inner wall ring. Extrude an outline you sketch, or AI-replace with a cleaner profile.',
    category: 'utility',
    fields: [
      { key: 'diameter', label: 'Outer Ø (mm)', kind: 'number', default: 60, step: 1 },
      { key: 'wall', label: 'Wall thickness (mm)', kind: 'number', default: 1.2, step: 0.1 },
      { key: 'height', label: 'Cutter height (mm)', kind: 'number', default: 20, step: 1 },
      { key: 'flange', label: 'Top flange width (mm)', kind: 'number', default: 4, step: 0.5 },
    ],
    build: (p) => {
      const d = n(p.diameter, 60), w = n(p.wall, 1.2), h = n(p.height, 20), f = n(p.flange, 4);
      return scene([
        { ...createNode('tube'), name: 'Cutter wall', params: { outerDiameter: d, innerDiameter: d - 2 * w, height: h } },
        { ...createNode('tube'), name: 'Top flange', params: { outerDiameter: d + 2 * f, innerDiameter: d - 2 * w, height: 1.2 },
          pos: { x: 0, y: 0, z: h / 2 - 0.6 } },
      ]);
    },
  },

  // --- Enclosures --------------------------------------------------------
  {
    id: 'box_enclosure',
    label: 'Box / Enclosure',
    description: 'Parametric hollow box with a snap-fit lid lip.',
    category: 'enclosure',
    fields: [
      { key: 'width', label: 'Outer width (X mm)', kind: 'number', default: 80, step: 1 },
      { key: 'depth', label: 'Outer depth (Y mm)', kind: 'number', default: 60, step: 1 },
      { key: 'height', label: 'Outer height (Z mm)', kind: 'number', default: 30, step: 1 },
      { key: 'wall', label: 'Wall thickness (mm)', kind: 'number', default: 2, step: 0.1 },
      { key: 'radius', label: 'Corner radius (mm)', kind: 'number', default: 3, step: 0.1 },
    ],
    build: (p) => {
      const w = n(p.width, 80), d = n(p.depth, 60), h = n(p.height, 30), wall = n(p.wall, 2), r = n(p.radius, 3);
      return scene([
        { ...createNode('rounded_box'), name: 'Body', params: { width: w, depth: d, height: h, radius: r } },
        { ...createNode('rounded_box', 'difference'), name: 'Cavity', params: { width: w - 2 * wall, depth: d - 2 * wall, height: h - wall, radius: Math.max(r - wall, 0.5) },
          pos: { x: 0, y: 0, z: wall } },
      ]);
    },
  },
  {
    id: 'esp32_case_v2',
    label: 'ESP32 Case',
    description: 'DevKit-sized case with USB cutout. Tweak inner dims for your exact board.',
    category: 'enclosure',
    fields: [
      { key: 'innerLength', label: 'Inner length (mm)', kind: 'number', default: 56, step: 0.5 },
      { key: 'innerWidth', label: 'Inner width (mm)', kind: 'number', default: 31, step: 0.5 },
      { key: 'innerHeight', label: 'Inner height (mm)', kind: 'number', default: 14, step: 0.5 },
      { key: 'wall', label: 'Wall thickness (mm)', kind: 'number', default: 2, step: 0.1 },
      { key: 'usbWidth', label: 'USB cutout width (mm)', kind: 'number', default: 12, step: 0.5 },
      { key: 'usbHeight', label: 'USB cutout height (mm)', kind: 'number', default: 6, step: 0.5 },
    ],
    build: (p) => {
      const iL = n(p.innerLength, 56), iW = n(p.innerWidth, 31), iH = n(p.innerHeight, 14);
      const wall = n(p.wall, 2);
      const oL = iL + 2 * wall, oW = iW + 2 * wall, oH = iH + wall;
      return scene([
        { ...createNode('rounded_box'), name: 'Shell', params: { width: oL, depth: oW, height: oH, radius: 2 } },
        { ...createNode('rounded_box', 'difference'), name: 'Cavity', params: { width: iL, depth: iW, height: iH, radius: 1.5 },
          pos: { x: 0, y: 0, z: wall } },
        { ...createNode('cube', 'difference'), name: 'USB cutout', params: { width: n(p.usbWidth, 12), depth: wall * 3, height: n(p.usbHeight, 6) },
          pos: { x: -oL / 2 + wall / 2, y: 0, z: wall + 2 } },
      ]);
    },
  },

  // --- Mechanical --------------------------------------------------------
  {
    id: 'bracket_l',
    label: 'L-Bracket',
    description: 'Right-angle bracket with mounting holes on each leg.',
    category: 'mechanical',
    fields: [
      { key: 'legA', label: 'Leg A length (mm)', kind: 'number', default: 40, step: 1 },
      { key: 'legB', label: 'Leg B length (mm)', kind: 'number', default: 40, step: 1 },
      { key: 'width', label: 'Width (mm)', kind: 'number', default: 30, step: 1 },
      { key: 'thickness', label: 'Thickness (mm)', kind: 'number', default: 4, step: 0.5 },
      { key: 'holeDiameter', label: 'Hole Ø (mm)', kind: 'number', default: 4.2, step: 0.1 },
    ],
    build: (p) => {
      const a = n(p.legA, 40), b = n(p.legB, 40), w = n(p.width, 30), t = n(p.thickness, 4), d = n(p.holeDiameter, 4.2);
      return scene([
        { ...createNode('cube'), name: 'Leg A', params: { width: a, depth: w, height: t }, pos: { x: 0, y: 0, z: t / 2 } },
        { ...createNode('cube'), name: 'Leg B', params: { width: t, depth: w, height: b }, pos: { x: -a / 2 + t / 2, y: 0, z: b / 2 + t } },
        { ...createNode('cylinder', 'difference'), name: 'Hole A1', params: { diameter: d, height: t + 1 }, pos: { x: a / 4, y: w / 4, z: t / 2 } },
        { ...createNode('cylinder', 'difference'), name: 'Hole A2', params: { diameter: d, height: t + 1 }, pos: { x: a / 4, y: -w / 4, z: t / 2 } },
        { ...createNode('cylinder', 'difference'), name: 'Hole B1', params: { diameter: d, height: t + 1 }, rot: { x: 0, y: 90, z: 0 },
          pos: { x: -a / 2 + t / 2, y: w / 4, z: b * 0.7 } },
        { ...createNode('cylinder', 'difference'), name: 'Hole B2', params: { diameter: d, height: t + 1 }, rot: { x: 0, y: 90, z: 0 },
          pos: { x: -a / 2 + t / 2, y: -w / 4, z: b * 0.7 } },
      ]);
    },
  },
  {
    id: 'gear_spur',
    label: 'Spur Gear (approx)',
    description: 'Polygon-approximated spur gear. For real involute teeth use the AI Generate panel.',
    category: 'mechanical',
    fields: [
      { key: 'teeth', label: 'Tooth count', kind: 'number', default: 16, step: 1, min: 6 },
      { key: 'module', label: 'Module (mm/tooth)', kind: 'number', default: 1.5, step: 0.1, min: 0.4 },
      { key: 'thickness', label: 'Thickness (mm)', kind: 'number', default: 5, step: 0.5 },
      { key: 'boreDiameter', label: 'Bore Ø (mm)', kind: 'number', default: 5, step: 0.1 },
    ],
    build: (p) => {
      const t = n(p.teeth, 16), m = n(p.module, 1.5);
      const pitchDiameter = m * t;
      const tipDiameter = pitchDiameter + 2 * m;
      return scene([
        // Approximate body — AI/SCAD prompt should refine to real involute.
        { ...createNode('cylinder'), name: `Gear body (${t}T)`, params: { diameter: tipDiameter, height: n(p.thickness, 5) } },
        { ...createNode('cylinder', 'difference'), name: 'Bore', params: { diameter: n(p.boreDiameter, 5), height: n(p.thickness, 5) + 1 } },
      ]);
    },
  },
  {
    id: 'servo_mount_v2',
    label: 'Servo Mount (SG90)',
    description: 'Standard SG90 servo flange. Adjust for MG996R or other sizes.',
    category: 'mechanical',
    fields: [
      { key: 'length', label: 'Servo length (mm)', kind: 'number', default: 23, step: 0.1 },
      { key: 'width', label: 'Servo width (mm)', kind: 'number', default: 12.5, step: 0.1 },
      { key: 'flange', label: 'Flange width (mm)', kind: 'number', default: 6, step: 0.5 },
      { key: 'thickness', label: 'Plate thickness (mm)', kind: 'number', default: 3, step: 0.5 },
      { key: 'holeDiameter', label: 'Mount hole Ø (mm)', kind: 'number', default: 2.2, step: 0.1 },
    ],
    build: (p) => {
      const L = n(p.length, 23), W = n(p.width, 12.5), F = n(p.flange, 6), T = n(p.thickness, 3);
      return scene([
        { ...createNode('cube'), name: 'Plate', params: { width: L + 2 * F, depth: W + 4, height: T } },
        { ...createNode('cube', 'difference'), name: 'Servo cutout', params: { width: L, depth: W, height: T + 2 } },
        { ...createNode('cylinder', 'difference'), name: 'Hole +', params: { diameter: n(p.holeDiameter, 2.2), height: T + 2 },
          pos: { x: L / 2 + F / 2, y: 0, z: 0 } },
        { ...createNode('cylinder', 'difference'), name: 'Hole -', params: { diameter: n(p.holeDiameter, 2.2), height: T + 2 },
          pos: { x: -(L / 2 + F / 2), y: 0, z: 0 } },
      ]);
    },
  },

  // --- Reference-driven (guidance only) ----------------------------------
  {
    id: 'image_to_3d',
    label: 'Image → 3D Reference',
    description: 'Adds a placeholder plate. Attach a reference image and use the AI Generate panel to drive editable CAD.',
    category: 'reference',
    guidanceOnly: true,
    guidanceNote: 'No automatic image-to-mesh here. The image guides the AI to write editable OpenSCAD.',
    fields: [
      { key: 'width', label: 'Plate width (mm)', kind: 'number', default: 60, step: 1 },
      { key: 'depth', label: 'Plate depth (mm)', kind: 'number', default: 60, step: 1 },
    ],
    build: (p) => scene([
      { ...createNode('cube'), name: 'Image reference plate', params: { width: n(p.width, 60), depth: n(p.depth, 60), height: 2 } },
    ]),
  },
  {
    id: 'sketch_to_3d',
    label: 'Sketch → 3D Reference',
    description: 'Adds a thin extruded plate sized for your sketch. Use the AI Generate panel to convert the sketch into a real profile.',
    category: 'reference',
    guidanceOnly: true,
    guidanceNote: 'Sketch is sent to the AI as guidance; OpenSCAD geometry remains editable.',
    fields: [
      { key: 'width', label: 'Plate width (mm)', kind: 'number', default: 60, step: 1 },
      { key: 'depth', label: 'Plate depth (mm)', kind: 'number', default: 60, step: 1 },
      { key: 'height', label: 'Extrude height (mm)', kind: 'number', default: 4, step: 0.5 },
    ],
    build: (p) => scene([
      { ...createNode('cube'), name: 'Sketch reference plate', params: { width: n(p.width, 60), depth: n(p.depth, 60), height: n(p.height, 4) } },
    ]),
  },
];

export function findGenerator(id: string): MakerLabGenerator | undefined {
  return MAKERLAB_GENERATORS.find((g) => g.id === id);
}

export function defaultParams(g: MakerLabGenerator): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const f of g.fields) out[f.key] = f.default;
  return out;
}

export function emptyMakerlabScene(): Scene {
  return emptyScene();
}
