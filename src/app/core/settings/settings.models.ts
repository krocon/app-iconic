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

export interface Settings {
  schemaVersion: number;
  theme: ThemeChoice;
  language: LanguageChoice;
  panels: Record<PanelKey, PanelSettings>;
  canvas: CanvasSettings;
  export: ExportSettings;
  freehand: { epsilon: number; strokeWidth: number; closed: boolean };
  debug: { logUndoGrouping: boolean };
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
