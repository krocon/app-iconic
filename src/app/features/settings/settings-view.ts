/** What the settings dialog lists (design 015 E12). Pure. */

export const SECTIONS = ['general', 'canvas', 'snapping', 'export', 'advanced'] as const;
export type SectionId = (typeof SECTIONS)[number];

/**
 * Canvas options shown as checkboxes, labelled with the name of their View action (one text for
 * menu and dialog).
 */
export const ACTION_TOGGLES: readonly { key: string; action: string; section: SectionId }[] = [
  { key: 'canvas.rulers', action: 'view.rulers', section: 'canvas' },
  { key: 'canvas.guides', action: 'view.guides', section: 'canvas' },
  { key: 'canvas.background', action: 'view.background', section: 'canvas' },
  { key: 'canvas.effects', action: 'view.effects', section: 'canvas' },
  { key: 'canvas.crossCursor', action: 'view.crossCursor', section: 'canvas' },
  { key: 'canvas.handles', action: 'view.handles', section: 'canvas' },
  { key: 'canvas.snapToGrid', action: 'view.snapToGrid', section: 'snapping' },
  { key: 'canvas.magicSnap', action: 'view.magicSnap', section: 'snapping' },
];

/** Start zoom of new windows: 0 = fit, then the zoom steps (legacy §5). */
export const ZOOM_CHOICES: readonly number[] = [0, 0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 2];
