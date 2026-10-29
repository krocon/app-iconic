import { ConfigWarning } from '../menu/menu.models';

/** Mirror of Rust `ai-core::settings::Settings` (design 015; defaults: legacy §9). */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type LanguageChoice = 'system' | 'en' | 'de';
export type PanelKey = 'commands' | 'hierarchy' | 'properties';

export interface PanelSettings {
  visible: boolean;
  /** CSS pixels, {@link PANEL_MIN}…{@link PANEL_MAX}. */
  width: number;
}

export interface CanvasSettings {
  rulers: boolean;
  guides: boolean;
  background: boolean;
  effects: boolean;
  crossCursor: boolean;
  handles: boolean;
  snapToGrid: boolean;
  magicSnap: boolean;
  /** Smart Guides: path, tangent, perpendicular, construction guides (prompt 040). */
  smartGuides: boolean;
  /** The icon grid drawn as guides (prompt 056). */
  guideTemplate: 'apple' | 'material' | 'grid';
  /** Divisions of the `grid` template, 2…64. */
  guideDivisions: number;
  /** 1…256 document units. */
  gridSize: number;
  gridOrigin: 'worldZero' | 'svgCenter';
  selectionMode: 'point' | 'boxed' | 'none';
  /** Start zoom of new windows: 0 = fit, else 0.25…2 (design 015 E7). */
  zoom: number;
  appearance: ThemeChoice;
  mask: 'none' | 'squircle' | 'circle';
}

export interface ExportSettings {
  format: 'png' | 'svg';
  appearances: ('light' | 'dark')[];
  sizes: number[];
  mask: 'none' | 'squircle' | 'circle';
  effects: boolean;
  targetDir: string | null;
}

/** The remembered paint of one kind of shape (design 019 E12): attribute values, `''` = not set. */
export interface DrawStyle {
  fill: string;
  fillOpacity: string;
  stroke: string;
  strokeWidth: string;
  strokeOpacity: string;
  strokeLinecap: string;
  strokeLinejoin: string;
  strokeDasharray: string;
  opacity: string;
}

/** The kinds of shape with a remembered style (design 019 E12). */
export const STYLE_KINDS = [
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'arc',
] as const;
export type StyleKind = (typeof STYLE_KINDS)[number];

/** A thin black line without fill (design 019 E13). */
export const THIN_LINE: DrawStyle = {
  fill: 'none',
  fillOpacity: '',
  stroke: '#000000',
  strokeWidth: '1',
  strokeOpacity: '',
  strokeLinecap: '',
  strokeLinejoin: '',
  strokeDasharray: '',
  opacity: '',
};

export interface Settings {
  schemaVersion: number;
  theme: ThemeChoice;
  language: LanguageChoice;
  panels: Record<PanelKey, PanelSettings>;
  canvas: CanvasSettings;
  export: ExportSettings;
  freehand: { epsilon: number; strokeWidth: number; closed: boolean };
  debug: { logUndoGrouping: boolean };
  /** AI control over MCP (design 018 E16): bridge open, ask before saving to a new path/export. */
  mcp: { enabled: boolean; confirmFiles: boolean };
  /** Paint of new shapes, remembered per kind (design 019 E12). */
  drawing: { styles: Record<StyleKind, DrawStyle> };
}

/** A part of the settings (what a window sends, design 015 E4); lists are sent whole. */
export type SettingsPatch = DeepPartial<Settings>;
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const SCHEMA_VERSION = 1;
export const PANEL_MIN = 160;
export const PANEL_MAX = 480;

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  theme: 'system',
  language: 'system',
  panels: {
    commands: { visible: true, width: 260 },
    hierarchy: { visible: true, width: 260 },
    properties: { visible: true, width: 300 },
  },
  canvas: {
    rulers: true,
    guides: true,
    background: true,
    effects: true,
    crossCursor: true,
    handles: true,
    snapToGrid: false,
    magicSnap: true,
    smartGuides: true,
    guideTemplate: 'apple',
    guideDivisions: 8,
    gridSize: 10,
    gridOrigin: 'worldZero',
    selectionMode: 'point',
    zoom: 0,
    appearance: 'system',
    mask: 'squircle',
  },
  export: {
    format: 'png',
    appearances: ['light', 'dark'],
    sizes: [1024],
    mask: 'none',
    effects: false,
    targetDir: null,
  },
  freehand: { epsilon: 2.5, strokeWidth: 8, closed: false },
  debug: { logUndoGrouping: false },
  mcp: { enabled: false, confirmFiles: true },
  drawing: {
    styles: Object.fromEntries(STYLE_KINDS.map((k) => [k, { ...THIN_LINE }])) as Record<
      StyleKind,
      DrawStyle
    >,
  },
};

/** `load_settings` (Rust `LoadedSettings`). */
export interface LoadedSettings {
  value: Settings;
  warning: ConfigWarning | null;
}

/** Payload of `settings-changed` (Rust `SettingsChanged`). */
export interface SettingsChanged {
  settings: Settings;
  /** Label of the window that changed them. */
  from: string;
}
