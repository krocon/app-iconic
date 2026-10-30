import { ActionDef, EDIT, VIEW, ADD } from './action-def';
import { CONSTRAINT_ADD_ARGS, CONSTRAINT_TOOL_ARGS } from '../constraint-action-args';
import {
  GRADIENT_ADD_STOP_ARGS,
  GRADIENT_CREATE_ARGS,
  GRADIENT_PAINT_ARGS,
  GRADIENT_REMOVE_STOP_ARGS,
  GRADIENT_SET_ARGS,
  GRADIENT_SET_STOP_ARGS,
} from '../gradient-action-args';

/** The actions of path tools, effects, typography, colours, constraints, gradients, locks, measure and corners (split from `action-catalog.ts` in prompt 033). */
export const MODIFY_ACTIONS: readonly ActionDef[] = [
  // path tools (prompt 046): on/off; they edit the selected paths and shapes
  // Trim and Extend like Fusion 360 (prompt 050)
  EDIT('trim.tool', 'Trim'),
  EDIT('extend.tool', 'Extend'),
  EDIT('trim.at', 'Trim at Point', {
    palette: false,
    args: {
      type: 'object',
      required: ['x', 'y'],
      properties: { x: { type: 'number' }, y: { type: 'number' } },
    },
  }),
  EDIT('extend.at', 'Extend at Point', {
    palette: false,
    args: {
      type: 'object',
      required: ['x', 'y'],
      properties: { x: { type: 'number' }, y: { type: 'number' } },
    },
  }),
  // Fillet and Chamfer between outlines (prompt 051)
  EDIT('fillet.tool', 'Fillet'),
  EDIT('chamfer.tool', 'Chamfer'),
  EDIT('fillet.at', 'Fillet / Chamfer at Points', {
    palette: false,
    args: {
      type: 'object',
      required: ['a', 'radius'],
      properties: {
        kind: { type: 'string', enum: ['fillet', 'chamfer'] },
        /** {x, y} on the first side (the part that stays). */
        a: { type: 'json' },
        /** {x, y} on the second side; without it the corner of one path at `a`. */
        b: { type: 'json' },
        radius: { type: 'number', minimum: 0 },
      },
    },
  }),
  EDIT('path.addAnchor', 'Add Anchor Point Tool'),
  EDIT('path.deleteAnchor', 'Delete Anchor Point Tool'),
  EDIT('path.anchorPoint', 'Anchor Point Tool'),
  EDIT('path.scissors', 'Scissors Tool'),
  EDIT('path.smooth', 'Smooth Tool'),
  EDIT('path.eraser', 'Path Eraser Tool'),
  // Offset Path and Outline Stroke (prompt 052)
  EDIT('path.offset', 'Offset Path…', {
    args: {
      type: 'object',
      properties: {
        /** > 0 grows, < 0 shrinks (document units); without it the dialog. */
        distance: { type: 'number' },
        join: { type: 'string', enum: ['miter', 'round', 'bevel'] },
        replace: { type: 'boolean' },
      },
    },
  }),
  EDIT('path.outlineStroke', 'Outline Stroke'),
  EDIT('path.join', 'Join Paths'),
  EDIT('path.convert', 'Convert to Path'),
  // Pathfinder, Shape Builder, cuts (prompt 047)
  EDIT('pathfinder.unite', 'Unite'),
  EDIT('pathfinder.minusFront', 'Minus Front'),
  EDIT('pathfinder.intersect', 'Intersect'),
  EDIT('pathfinder.exclude', 'Exclude'),
  EDIT('pathfinder.divide', 'Divide'),
  EDIT('shapeBuilder.tool', 'Shape Builder Tool'),
  EDIT('cut.knife', 'Knife Tool'),
  EDIT('cut.lineCut', 'Line Cut Tool'),
  EDIT('cut.rectCut', 'Rectangle Cut Tool'),
  // patterns, mirror, clone, construction lines like Fusion 360 (prompt 049)
  ADD('pattern.circular', 'Circular Pattern…', {
    args: {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 2, maximum: 1001 },
        /** Total angle in degrees; 360 = full turn. */
        angle: { type: 'number', minimum: -360, maximum: 360 },
        /** Centre [x, y] in document units; default: centre of the selection. */
        center: { type: 'json' },
      },
    },
  }),
  ADD('pattern.rectangular', 'Rectangular Pattern…', {
    args: {
      type: 'object',
      properties: {
        columns: { type: 'integer', minimum: 1, maximum: 1001 },
        rows: { type: 'integer', minimum: 1, maximum: 1001 },
        dx: { type: 'number' },
        dy: { type: 'number' },
      },
    },
  }),
  ADD('pattern.mirror', 'Mirror', {
    args: {
      type: 'object',
      properties: {
        /** Two points [x, y] of the mirror line (document units). */
        a: { type: 'json' },
        b: { type: 'json' },
      },
    },
  }),
  ADD('pattern.centerHere', 'Circular Pattern: Centre of the Selection', {
    context: 'canvas',
    palette: false,
  }),
  EDIT('edit.cloneLinked', 'Clone (Linked)'),
  EDIT('edit.toggleConstruction', 'Construction Line'),
  // draw as construction (prompt 058)
  ADD('sketch.toggleConstructionMode', 'Draw as Construction'),
  // live fills (prompt 060)
  ADD('fill.tool', 'Fill Tool'),
  // effects and masks (prompt 076)
  ...(['effect.add', 'effect.set', 'effect.remove'] as const).map((id) =>
    EDIT(
      id,
      { 'effect.add': 'Add Effect', 'effect.set': 'Set Effect', 'effect.remove': 'Remove Effect' }[
        id
      ],
      {
        palette: false,
        args: {
          type: 'object',
          required: ['kind'],
          properties: {
            kind: { type: 'string', enum: ['dropShadow', 'innerShadow', 'blur'] },
            node: { type: 'json' },
            on: { type: 'boolean' },
            color: { type: 'string', maxLength: 16 },
            opacity: { type: 'number', minimum: 0, maximum: 1 },
            dx: { type: 'number', minimum: -1000, maximum: 1000 },
            dy: { type: 'number', minimum: -1000, maximum: 1000 },
            radius: { type: 'number', minimum: 0, maximum: 500 },
          },
        },
      },
    ),
  ),
  EDIT('mask.create', 'Create Mask'),
  EDIT('mask.release', 'Release Mask', {
    args: { type: 'object', properties: { node: { type: 'json' } } },
  }),
  EDIT('mask.type', 'Mask Type', {
    palette: false,
    args: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['luminance', 'alpha'] },
        node: { type: 'json' },
      },
    },
  }),
  // live typography (prompt 075)
  ADD('text.tool', 'Text Tool'),
  EDIT('text.edit', 'Edit Text'),
  EDIT('text.set', 'Set Text', {
    palette: false,
    args: {
      type: 'object',
      required: ['node', 'text'],
      properties: { node: { type: 'json' }, text: { type: 'string', maxLength: 65536 } },
    },
  }),
  EDIT('text.toPath', 'Convert Text to Path', {
    args: { type: 'object', properties: { nodes: { type: 'json' } } },
  }),
  // the colour workflow (prompt 074)
  ADD('color.eyedropper', 'Eyedropper'),
  EDIT('color.pick', 'Pick Colour', {
    palette: false,
    args: {
      type: 'object',
      required: ['x', 'y'],
      properties: {
        x: { type: 'number', minimum: -100000, maximum: 100000 },
        y: { type: 'number', minimum: -100000, maximum: 100000 },
        target: { type: 'string', enum: ['fill', 'stroke'] },
      },
    },
  }),
  EDIT('color.replace', 'Replace Colour', {
    palette: false,
    args: {
      type: 'object',
      required: ['from', 'to'],
      properties: {
        from: { type: 'string', maxLength: 64 },
        to: { type: 'string', maxLength: 64 },
      },
    },
  }),
  ADD('fill.at', 'Fill Area at Point', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        color: { type: 'string', maxLength: 64 },
      },
      required: ['x', 'y'],
    },
  }),
  ADD('fill.across', 'Fill Areas as One', {
    palette: false,
    args: {
      type: 'object',
      properties: { points: { type: 'json' }, color: { type: 'string', maxLength: 64 } },
      required: ['points'],
    },
  }),
  EDIT('fill.remove', 'Remove Fill at Point', {
    palette: false,
    args: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
    },
  }),
  ADD('fill.color', 'Fill Colour', {
    palette: false,
    args: {
      type: 'object',
      properties: { color: { type: 'string', maxLength: 64 } },
      required: ['color'],
    },
  }),
  EDIT('fill.detach', 'Detach Fill'),
  // constraints and driving dimensions (prompt 059)
  ADD('constraint.tool', 'Constraint Tool', { args: CONSTRAINT_TOOL_ARGS }),
  ADD('constraint.add', 'Add Constraint', { palette: false, args: CONSTRAINT_ADD_ARGS }),
  EDIT('constraint.remove', 'Remove Constraint', {
    args: {
      type: 'object',
      properties: {
        asset: { type: 'string', maxLength: 256 },
        id: { type: 'string', maxLength: 40 },
      },
    },
  }),
  EDIT('constraint.setValue', 'Change Dimension Value', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        asset: { type: 'string', maxLength: 256 },
        id: { type: 'string', maxLength: 40 },
        value: { type: 'number' },
      },
      required: ['asset', 'id', 'value'],
    },
  }),
  EDIT('constraint.solve', 'Solve Constraints', {
    args: { type: 'object', properties: { asset: { type: 'string', maxLength: 256 } } },
  }),
  VIEW('view.constraints', 'Constraints'),
  // gradient editor (prompt 032)
  EDIT('gradient.create', 'Create Gradient', { args: GRADIENT_CREATE_ARGS }),
  EDIT('gradient.set', 'Change Gradient', { palette: false, args: GRADIENT_SET_ARGS }),
  EDIT('gradient.addStop', 'Add Gradient Stop', { palette: false, args: GRADIENT_ADD_STOP_ARGS }),
  EDIT('gradient.setStop', 'Change Gradient Stop', {
    palette: false,
    args: GRADIENT_SET_STOP_ARGS,
  }),
  EDIT('gradient.removeStop', 'Remove Gradient Stop', {
    palette: false,
    args: GRADIENT_REMOVE_STOP_ARGS,
  }),
  EDIT('gradient.editOnCanvas', 'Edit Gradient on Canvas'),
  EDIT('gradient.makeUnique', 'Make Gradient Unique', { args: GRADIENT_PAINT_ARGS }),
  // lock and isolate (prompt 055)
  EDIT('edit.toggleLock', 'Lock / Unlock', {
    args: { type: 'object', properties: { nodes: { type: 'json' }, items: { type: 'json' } } },
  }),
  // the tree (prompt 072): rename an element (its `id`, references follow)
  EDIT('edit.renameElement', 'Rename Element', {
    palette: false,
    args: {
      type: 'object',
      required: ['ref', 'id'],
      properties: { ref: { type: 'json' }, id: { type: 'string', maxLength: 255 } },
    },
  }),
  EDIT('edit.unlockAll', 'Unlock All'),
  EDIT('edit.isolate', 'Isolate Group'),
  VIEW('view.constructionLines', 'Construction Lines'),
  // Measure and Dimension (prompt 048)
  ADD('dimension.tool', 'Dimension Tool'),
  VIEW('measure.tool', 'Measure Tool'),
  ADD('dimension.add', 'Add Dimension', {
    palette: false,
    args: {
      type: 'object',
      required: ['kind', 'points', 'at'],
      properties: {
        kind: { type: 'string', enum: ['linear', 'radius', 'diameter', 'angle'] },
        /** linear: [[x1, y1], [x2, y2]]; radius / diameter: [[cx, cy]]; angle: corner, ray 1, ray 2. */
        points: { type: 'json' },
        /** Where it is placed: [x, y]. */
        at: { type: 'json' },
        r: { type: 'number', minimum: 0 },
      },
    },
  }),
  // Live Corners (prompt 045): without arguments the dialog
  EDIT('corners.set', 'Corners…', {
    args: {
      type: 'object',
      properties: {
        radius: { type: 'number', minimum: 0, maximum: 10000 },
        kind: { type: 'string', enum: ['round', 'inverted', 'chamfer'] },
      },
    },
  }),
];
