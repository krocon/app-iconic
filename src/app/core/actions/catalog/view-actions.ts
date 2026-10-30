import { ActionDef, EDIT, VIEW, ADD, ARRANGE } from './action-def';

/** The actions of view, selection and snapping options, canvas keys (split from `action-catalog.ts` in prompt 033). */
export const VIEW_ACTIONS: readonly ActionDef[] = [
  // view (legacy §4, §5, §9)
  VIEW('view.commandSidebar', 'Command Sidebar'),
  VIEW('view.hierarchy', 'Hierarchy'),
  VIEW('view.properties', 'Properties'),
  // width of a side panel (design 015 E10); without `width` the default
  VIEW('view.panelWidth', 'Side Panel Width', {
    palette: false,
    args: {
      type: 'object',
      required: ['panel'],
      properties: {
        panel: { type: 'string', enum: ['commands', 'hierarchy', 'properties'] },
        width: { type: 'integer', minimum: 0, maximum: 10000 },
      },
    },
  }),
  VIEW('view.rulers', 'Rulers'),
  VIEW('view.guides', 'Guides'),
  VIEW('view.background', 'Background'),
  VIEW('view.effects', 'Effects Preview (approximation)'),
  VIEW('view.crossCursor', 'Cross Cursor'),
  VIEW('view.handles', 'Show Handles'),
  VIEW('view.snapToGrid', 'Snap to Grid'),
  VIEW('view.magicSnap', 'Magic Snap'),
  VIEW('view.smartGuides', 'Smart Guides'),
  VIEW('view.zoomIn', 'Zoom In', { repeat: true }),
  VIEW('view.zoomOut', 'Zoom Out', { repeat: true }),
  VIEW('view.actualSize', 'Actual Size'),
  VIEW('view.zoomToFit', 'Zoom to Fit'),
  VIEW('view.centerCanvas', 'Center Canvas'),
  VIEW('view.zoomTo', 'Zoom to', {
    palette: false,
    args: {
      type: 'object',
      required: ['zoom'],
      properties: { zoom: { type: 'number', minimum: 0.25, maximum: 2 } },
    },
  }),
  VIEW('view.appearance.light', 'Appearance: Light'),
  VIEW('view.appearance.dark', 'Appearance: Dark'),
  VIEW('view.appearance.tinted', 'Appearance: Tinted'),
  VIEW('view.tint', 'Tint', {
    palette: false,
    args: {
      type: 'object',
      required: ['color'],
      properties: { color: { type: 'string' } },
    },
  }),
  VIEW('view.mask.squircle', 'Platform Mask: iOS / macOS'),
  VIEW('view.mask.circle', 'Platform Mask: watchOS'),
  VIEW('view.mask.none', 'Platform Mask: None'),
  // selection and snapping (design 007 E4, E13)
  VIEW('view.selectionMode.point', 'Selection Mode: Point'),
  VIEW('view.selectionMode.boxed', 'Selection Mode: Boxed'),
  VIEW('view.selectionMode.none', 'Selection Mode: None'),
  VIEW('guides.lock', 'Lock Guides'),
  VIEW('guides.clear', 'Clear Guides'),
  ADD('guide.add', 'Add Guide', {
    palette: false,
    args: {
      type: 'object',
      required: ['axis', 'at'],
      properties: {
        axis: { type: 'string', enum: ['horizontal', 'vertical'] },
        /** y of a horizontal, x of a vertical guide (document units). */
        at: { type: 'number' },
      },
    },
  }),
  // small sizes and pixel grid (prompt 057)
  VIEW('view.smallPreview', 'Small Sizes Preview'),
  VIEW('view.pixelGrid.off', 'Pixel Grid: Off'),
  VIEW('view.pixelGrid.16', 'Pixel Grid: 16 px'),
  VIEW('view.pixelGrid.32', 'Pixel Grid: 32 px'),
  VIEW('view.pixelGrid.64', 'Pixel Grid: 64 px'),
  VIEW('view.pixelGrid.128', 'Pixel Grid: 128 px'),
  ARRANGE('arrange.alignToPixels', 'Align to Pixel Grid'),
  VIEW('view.guideTemplate.apple', 'Icon Grid: Apple'),
  VIEW('view.guideTemplate.material', 'Icon Grid: Material Keylines'),
  VIEW('view.guideTemplate.grid', 'Icon Grid: Even Grid'),
  VIEW('view.guideDivisions', 'Icon Grid: Divisions', {
    palette: false,
    args: {
      type: 'object',
      required: ['divisions'],
      properties: { divisions: { type: 'integer', minimum: 2, maximum: 64 } },
    },
  }),
  VIEW('view.gridOrigin.worldZero', 'Grid Origin: World Zero'),
  VIEW('view.gridOrigin.svgCenter', 'Grid Origin: SVG Center'),
  // canvas keys (not in menus)
  VIEW('canvas.panHold', 'Pan (hold)', { context: 'canvas', hold: true, palette: false }),
  // canvas editing (design 007 E12, E15): Esc and Delete fall through when there is nothing to do
  EDIT('canvas.escape', 'Cancel / Leave Group', { context: 'canvas', palette: false }),
  EDIT('canvas.deletePoint', 'Delete Point', { context: 'canvas' }),
  // freehand tool (design 013 E4): only while the tool is on
  ADD('freehand.toggleClosed', 'Freehand: Open / Closed', { context: 'canvas' }),
];
