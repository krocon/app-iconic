import { MaskShape } from '../canvas/canvas-view.store';
import { ExportFormat } from './export-options';

/** Texts of the export (design 012). English is the source; German follows in prompt 015. */
export const EXPORT_TEXTS = {
  title: 'Export',
  format: 'Format',
  formats: { svg: 'SVG', png: 'PNG' } satisfies Record<ExportFormat, string>,
  appearances: 'Appearances',
  light: 'Light',
  dark: 'Dark',
  sizes: 'Sizes (px)',
  mask: 'Platform mask',
  masks: {
    none: 'None (App Store)',
    squircle: 'Squircle (iOS, macOS)',
    circle: 'Circle (watchOS)',
  } satisfies Record<MaskShape, string>,
  effects: 'Shadow & effects (approximation)',
  target: 'Folder',
  noTarget: 'No folder chosen',
  choose: 'Choose…',
  files: (n: number) => (n === 1 ? '1 file' : `${n} files`),
  untitled: 'Untitled',
  cancel: 'Cancel',
  close: 'Close',
  export: 'Export',
  stop: 'Stop',
  progress: (done: number, total: number) => `${done} of ${total}`,
  exists: 'Files with these names already exist in this folder. Replace them?',
  replace: 'Replace',
  done: (n: number) => (n === 1 ? 'Exported 1 file.' : `Exported ${n} files.`),
  cancelled: (n: number) => `Export stopped after ${n === 1 ? '1 file' : `${n} files`}.`,
  failed: (reason: string) => `Export failed: ${reason}`,
  noDocument: 'There is no document to export.',
  badArguments: 'unknown appearance or size',
  transparentWarning:
    'Some PNGs contain transparent pixels. Apple expects app icons without transparency – ' +
    'fill the background or export with a platform mask.',
} as const;
