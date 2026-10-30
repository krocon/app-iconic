import { ActionDef, ARRANGE, HELP, TREE, TEXT, NUDGES, ALIGN_ARGS } from './action-def';
import {
  CLIP_ASSIGN_ARGS,
  CLIP_CREATE_ARGS,
  CLIP_REMOVE_ARGS,
  CLIP_TARGET_ARGS,
  CLIP_UNITS_ARGS,
} from '../clip-action-args';

/** The actions of arrange, align, transform, clip paths, the tree and help (split from `action-catalog.ts` in prompt 033). */
export const ARRANGE_ACTIONS: readonly ActionDef[] = [
  // arrange (legacy §7.2, §7.3; prompt 006)
  ARRANGE('arrange.bringToFront', 'Bring to Front', TEXT),
  ARRANGE('arrange.sendToBack', 'Send to Back', TEXT),
  ARRANGE('arrange.moveUp', 'Move Up', { context: 'hierarchy', repeat: true }),
  ARRANGE('arrange.moveDown', 'Move Down', { context: 'hierarchy', repeat: true }),
  ARRANGE('arrange.moveInto', 'Move Into Group', { context: 'hierarchy' }),
  ARRANGE('arrange.moveOut', 'Move Out of Group', { context: 'hierarchy' }),
  ...NUDGES.map(([id, label]) =>
    ARRANGE(id, label, { context: 'canvas', repeat: true, palette: false }),
  ),
  // move the selection by a document delta (AI, tests; design 007 E12)
  ARRANGE('arrange.moveBy', 'Move By', {
    palette: false,
    args: {
      type: 'object',
      required: ['dx', 'dy'],
      properties: {
        dx: { type: 'number', minimum: -10000, maximum: 10000 },
        dy: { type: 'number', minimum: -10000, maximum: 10000 },
      },
    },
  }),
  ARRANGE('arrange.group', 'Group <g>'),
  ARRANGE('arrange.ungroup', 'Ungroup'),
  ARRANGE('arrange.align.left', 'Align Left', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.centerH', 'Align Centers Horizontally', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.right', 'Align Right', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.top', 'Align Top', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.middle', 'Align Centers Vertically', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.bottom', 'Align Bottom', { args: ALIGN_ARGS }),
  // align to, distribute (prompt 054)
  ARRANGE('arrange.alignTo.selection', 'Align to Selection'),
  ARRANGE('arrange.alignTo.canvas', 'Align to Canvas'),
  ARRANGE('arrange.alignTo.key', 'Align to Key Object'),
  ARRANGE('arrange.distribute.horizontalCenters', 'Distribute Horizontal Centres'),
  ARRANGE('arrange.distribute.verticalCenters', 'Distribute Vertical Centres'),
  ARRANGE('arrange.distribute.horizontalGaps', 'Distribute Horizontal Spacing'),
  ARRANGE('arrange.distribute.verticalGaps', 'Distribute Vertical Spacing'),
  ARRANGE('arrange.distribute.spacing', 'Distribute at Fixed Spacing', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        axis: { type: 'string', enum: ['horizontal', 'vertical'] },
        gap: { type: 'number' },
      },
    },
  }),
  // Transform with a pivot and numbers (prompt 053)
  ARRANGE('transform.rotate', 'Rotate Tool'),
  ARRANGE('transform.scale', 'Scale Tool'),
  ARRANGE('transform.reflect', 'Reflect Tool'),
  ARRANGE('transform.dialog', 'Transform…'),
  ARRANGE('transform.apply', 'Transform with Values', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        dx: { type: 'number' },
        dy: { type: 'number' },
        /** Degrees, clockwise on screen. */
        rotate: { type: 'number' },
        /** Factors (1 = 100 %). */
        sx: { type: 'number' },
        sy: { type: 'number' },
        reflect: { type: 'string', enum: ['none', 'horizontal', 'vertical'] },
        /** [x, y] in document units or one of tl t tr l c r bl b br (default c). */
        pivot: { type: 'json' },
        each: { type: 'boolean' },
        copy: { type: 'boolean' },
      },
    },
  }),
  // clip paths (design 014 E14)
  ARRANGE('clip.create', 'Create Clip Path', { args: CLIP_CREATE_ARGS }),
  ARRANGE('clip.assign', 'Assign Clip Path', { palette: false, args: CLIP_ASSIGN_ARGS }),
  ARRANGE('clip.edit', 'Edit Clip Path', { args: CLIP_TARGET_ARGS }),
  ARRANGE('clip.done', 'Finish Editing Clip Path'),
  ARRANGE('clip.remove', 'Remove Clip Path…', { args: CLIP_REMOVE_ARGS }),
  ARRANGE('clip.setUnits', 'Clip Path Units', { palette: false, args: CLIP_UNITS_ARGS }),
  // the tree (APG tree pattern, design 006 E5)
  TREE('hierarchy.next', 'Next Row'),
  TREE('hierarchy.prev', 'Previous Row'),
  TREE('hierarchy.first', 'First Row'),
  TREE('hierarchy.last', 'Last Row'),
  TREE('hierarchy.expand', 'Expand or Go to Child'),
  TREE('hierarchy.collapse', 'Collapse or Go to Parent'),
  TREE('hierarchy.extendNext', 'Extend Selection Down'),
  TREE('hierarchy.extendPrev', 'Extend Selection Up'),
  TREE('hierarchy.extendFirst', 'Extend Selection to First'),
  TREE('hierarchy.extendLast', 'Extend Selection to Last'),
  TREE('hierarchy.focusNext', 'Move Focus Down'),
  TREE('hierarchy.focusPrev', 'Move Focus Up'),
  TREE('hierarchy.select', 'Select Row'),
  TREE('hierarchy.toggleSelect', 'Add or Remove Row'),
  TREE('hierarchy.menu', 'Row Menu'),
  TREE('hierarchy.rename', 'Rename Row'),
  TREE('hierarchy.find', 'Filter Layers'),
  { ...TREE('hierarchy.expandAll', 'Expand All'), palette: true },
  { ...TREE('hierarchy.collapseAll', 'Collapse All'), palette: true },
  // help
  HELP('app.shortcuts', 'Keyboard Shortcuts'),
];
