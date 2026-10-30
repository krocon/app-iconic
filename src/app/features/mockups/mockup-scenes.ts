import { Appearance } from '../canvas/appearance';

/**
 * The scenes of "In Context" (prompt 081, design E2–E4): where the icon appears, in points (= CSS
 * pixels at 100 %, device pixels × 2 on Retina) – the icon sizes from the platforms' documents, the
 * rest (spacing, bars, panels) an own neutral layout. Pure: the SVG is built in `mockup-svg.ts`.
 */

export type SceneId = 'dock' | 'homeLight' | 'homeDark' | 'spotlight' | 'taskbar';

/** Which export SVG the scene shows (design E5). */
export type IconLook =
  /** Apple's macOS template (078 E4: 824 units with margin and shadow) – the Dock tile. */
  | 'macos'
  /** Squircle mask, like iOS masks the icon. */
  | 'squircle'
  /** The canvas's mask (like the `.ico` export of 078) – the Windows taskbar. */
  | 'view';

/** Light or dark backdrop; `auto` follows the scene's appearance (light → light, else dark). */
export type SceneTheme = 'light' | 'dark' | 'auto';

export interface SceneSpec {
  id: SceneId;
  width: number;
  height: number;
  /** Size of the own icon in points (see `source`). */
  iconSize: number;
  look: IconLook;
  theme: SceneTheme;
  /** Appearance shown first. */
  appearance: Appearance;
  /** Where the icon size comes from (design "Belege"). */
  source: string;
}

export const SCENES: readonly SceneSpec[] = [
  {
    id: 'dock',
    width: 520,
    height: 120,
    iconSize: 64,
    look: 'macos',
    theme: 'auto',
    appearance: 'light',
    source: 'Dock tile size default 64 pt (Dock payload `tilesize`, range 16–128)',
  },
  {
    id: 'homeLight',
    width: 360,
    height: 292,
    iconSize: 60,
    look: 'squircle',
    theme: 'light',
    appearance: 'light',
    source: 'iPhone app icon 60 × 60 pt (Apple, Asset Catalog Format Reference, AppIconType)',
  },
  {
    id: 'homeDark',
    width: 360,
    height: 292,
    iconSize: 60,
    look: 'squircle',
    theme: 'dark',
    appearance: 'dark',
    source: 'iPhone app icon 60 × 60 pt (Apple, Asset Catalog Format Reference, AppIconType)',
  },
  {
    id: 'spotlight',
    width: 360,
    height: 220,
    iconSize: 40,
    look: 'squircle',
    theme: 'auto',
    appearance: 'light',
    source: 'Spotlight 40 × 40 pt, notification 20 × 20 pt (Apple, AppIconType)',
  },
  {
    id: 'taskbar',
    width: 480,
    height: 96,
    iconSize: 24,
    look: 'view',
    theme: 'auto',
    appearance: 'light',
    source: 'Taskbar 24 × 24 px at 100 % (Microsoft, App icon construction)',
  },
];

export const SCENE_IDS: readonly SceneId[] = SCENES.map((s) => s.id);

export function sceneSpec(id: SceneId): SceneSpec {
  return SCENES.find((s) => s.id === id)!;
}

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === 'string' && (SCENE_IDS as readonly string[]).includes(v);
}

/** The backdrop of a scene in an appearance. */
export function sceneTheme(spec: SceneSpec, appearance: Appearance): 'light' | 'dark' {
  if (spec.theme !== 'auto') return spec.theme;
  return appearance === 'light' ? 'light' : 'dark';
}

/** An icon place (top left, square side) in points. */
export interface Slot {
  x: number;
  y: number;
  size: number;
}

/** A neutral placeholder icon: one of the abstract glyphs on an own colour (index into the palette). */
export interface Placeholder extends Slot {
  tone: number;
}

/** A rectangle of the scene's chrome (panels, bars). */
export interface Panel {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/** A text line: the icon's name; `null` text = an abstract bar of `width`. */
export interface Line {
  x: number;
  y: number;
  width: number;
  /** Text size (points); bars are a third as high. */
  size: number;
  anchor: 'start' | 'middle';
  /** The icon's name is written here (else an abstract bar). */
  name: boolean;
  /** Secondary (muted) colour. */
  muted?: boolean;
}

export interface SceneLayout {
  spec: SceneSpec;
  /** Where the edited icon sits (the first one is the main place of `iconSize`). */
  own: Slot[];
  placeholders: Placeholder[];
  panels: Panel[];
  lines: Line[];
  /** Small marks (Dock's running dot, the taskbar's active pill). */
  marks: Panel[];
  /** A highlight behind the own icon (taskbar). */
  highlight: Panel | null;
}

const empty = (spec: SceneSpec): SceneLayout => ({
  spec,
  own: [],
  placeholders: [],
  panels: [],
  lines: [],
  marks: [],
  highlight: null,
});

/** Dock: seven tiles of 64 pt on a bar, the own icon fourth, its running dot and name label. */
function dock(spec: SceneSpec): SceneLayout {
  const l = empty(spec);
  const n = 7;
  const s = spec.iconSize;
  const gap = 4;
  const pad = 8;
  const barW = n * s + (n - 1) * gap + 2 * pad;
  const barX = (spec.width - barW) / 2;
  const barH = s + 2 * pad;
  const barY = spec.height - barH - 8;
  l.panels.push({ x: barX, y: barY, width: barW, height: barH, radius: 18 });
  for (let i = 0; i < n; i++) {
    const slot = { x: barX + pad + i * (s + gap), y: barY + pad, size: s };
    if (i === 3) l.own.push(slot);
    else l.placeholders.push({ ...slot, tone: i });
  }
  const own = l.own[0];
  l.marks.push({ x: own.x + s / 2 - 2, y: barY + barH - 6, width: 4, height: 4, radius: 2 });
  l.lines.push({
    x: own.x + s / 2,
    y: barY - 10,
    width: 120,
    size: 12,
    anchor: 'middle',
    name: true,
  });
  return l;
}

/** Home screen: a 4 × 3 grid of 60 pt icons with labels, the own icon in row 2, column 2. */
function home(spec: SceneSpec): SceneLayout {
  const l = empty(spec);
  const s = spec.iconSize;
  const cols = 4;
  const margin = 24;
  const gap = (spec.width - 2 * margin - cols * s) / (cols - 1);
  const pitch = 96;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < cols; c++) {
      const slot = { x: margin + c * (s + gap), y: 16 + r * pitch, size: s };
      const cx = slot.x + s / 2;
      const own = r === 1 && c === 1;
      if (own) l.own.push(slot);
      else l.placeholders.push({ ...slot, tone: r * cols + c });
      l.lines.push({
        x: cx,
        y: slot.y + s + 15,
        width: own ? s + gap - 4 : 34,
        size: 11,
        anchor: 'middle',
        name: own,
      });
    }
  }
  return l;
}

/** Spotlight result (40 pt) and a notification banner (20 pt) on panels. */
function spotlight(spec: SceneSpec): SceneLayout {
  const l = empty(spec);
  const w = spec.width - 32;
  l.panels.push({ x: 16, y: 16, width: w, height: 36, radius: 10 });
  l.lines.push({ x: 48, y: 38, width: 140, size: 13, anchor: 'start', name: false, muted: true });
  l.placeholders.push({ x: 26, y: 26, size: 16, tone: 7 });
  // result row
  l.panels.push({ x: 16, y: 64, width: w, height: 64, radius: 14 });
  l.own.push({ x: 28, y: 76, size: spec.iconSize });
  l.lines.push({ x: 80, y: 92, width: 200, size: 14, anchor: 'start', name: true });
  l.lines.push({ x: 80, y: 112, width: 120, size: 12, anchor: 'start', name: false, muted: true });
  // notification banner
  l.panels.push({ x: 16, y: 140, width: w, height: 64, radius: 18 });
  l.own.push({ x: 28, y: 150, size: 20 });
  l.lines.push({ x: 56, y: 165, width: 160, size: 11, anchor: 'start', name: true, muted: true });
  l.lines.push({ x: 28, y: 184, width: 220, size: 13, anchor: 'start', name: false });
  l.lines.push({ x: 28, y: 198, width: 270, size: 12, anchor: 'start', name: false, muted: true });
  return l;
}

/** Taskbar: a 48 px bar with 24 px icons in 40 px buttons, centred; the own one active. */
function taskbar(spec: SceneSpec): SceneLayout {
  const l = empty(spec);
  const barH = 48;
  const barY = spec.height - barH;
  l.panels.push({ x: 0, y: barY, width: spec.width, height: barH, radius: 0 });
  const n = 7;
  const button = 40;
  const gap = 4;
  const total = n * button + (n - 1) * gap;
  const x0 = (spec.width - total) / 2;
  const s = spec.iconSize;
  for (let i = 0; i < n; i++) {
    const bx = x0 + i * (button + gap);
    const slot = { x: bx + (button - s) / 2, y: barY + (barH - s) / 2, size: s };
    if (i === 4) {
      l.own.push(slot);
      l.highlight = { x: bx, y: barY + 4, width: button, height: button, radius: 4 };
      l.marks.push({ x: bx + 12, y: barY + barH - 6, width: 16, height: 3, radius: 1.5 });
    } else l.placeholders.push({ ...slot, tone: i });
  }
  return l;
}

/** The layout of a scene (positions in points). */
export function sceneLayout(id: SceneId): SceneLayout {
  const spec = sceneSpec(id);
  switch (id) {
    case 'dock':
      return dock(spec);
    case 'homeLight':
    case 'homeDark':
      return home(spec);
    case 'spotlight':
      return spotlight(spec);
    case 'taskbar':
      return taskbar(spec);
  }
}

/** Scales offered for "copy/save as PNG" (Rust `SCENE_SCALES`). */
export const SCENE_SCALES = [1, 2, 3] as const;
export type SceneScale = (typeof SCENE_SCALES)[number];
