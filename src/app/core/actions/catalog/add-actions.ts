import { ActionDef, ADD } from './action-def';
import { IMAGE_ARGS, shapeArgsSpec, SNIPPET_ARGS } from '../add-action-args';
import { FREEHAND_ARGS, SYMBOL_ARGS, TEXT_PATH_ARGS } from '../tool-action-args';
import { SKETCH_ARGS, PEN_ARGS, CURVATURE_ARGS } from '../sketch-action-args';

/** The actions of add, sketch, pen and curvature tools (split from `action-catalog.ts` in prompt 033). */
export const ADD_ACTIONS: readonly ActionDef[] = [
  // add (legacy §8; prompts 008, 013) – with serialisable arguments (design 008 E6)
  ADD('add.iconGroup', 'Group (SVG)'),
  ADD('add.layer', 'Layer (SVG)'),
  ADD('add.container', 'Container <g>', { args: shapeArgsSpec('container') }),
  ADD('add.circle', 'Circle at Center', { args: shapeArgsSpec('circle') }),
  ADD('add.ellipse', 'Ellipse', { args: shapeArgsSpec('ellipse') }),
  ADD('add.rect', 'Rectangle at Center', { args: shapeArgsSpec('rect') }),
  ADD('add.path', 'Path', { args: shapeArgsSpec('path') }),
  ADD('add.freehand', 'Freehand', { args: FREEHAND_ARGS }),
  ADD('add.line', 'Line at Center', { args: shapeArgsSpec('line') }),
  ADD('add.polyline', 'Polyline', { args: shapeArgsSpec('polyline') }),
  ADD('add.polygon', 'Polygon at Center', { args: shapeArgsSpec('polygon') }),
  ADD('add.text', 'Text', { args: shapeArgsSpec('text') }),
  ADD('add.textToPath', 'Text to Path…', { args: TEXT_PATH_ARGS }),
  ADD('add.symbol', 'Symbol…', { args: SYMBOL_ARGS }),
  ADD('add.svgSnippet', 'SVG Snippet…', { args: SNIPPET_ARGS }),
  ADD('add.image', 'Image…', { args: IMAGE_ARGS }),
  // sketch tools like Fusion (prompt 019): without arguments the mouse tool on/off
  ADD('sketch.line', 'Line', { args: SKETCH_ARGS }),
  ADD('sketch.midpointLine', 'Midpoint Line', { args: SKETCH_ARGS }),
  ADD('sketch.rect2p', '2-Point Rectangle', { args: SKETCH_ARGS }),
  ADD('sketch.rect3p', '3-Point Rectangle', { args: SKETCH_ARGS }),
  ADD('sketch.rectCenter', 'Center Rectangle', { args: SKETCH_ARGS }),
  ADD('sketch.circleCenter', 'Center Diameter Circle', { args: SKETCH_ARGS }),
  ADD('sketch.circle2p', '2-Point Circle', { args: SKETCH_ARGS }),
  ADD('sketch.circle3p', '3-Point Circle', { args: SKETCH_ARGS }),
  ADD('sketch.circle2t', '2-Tangent Circle', { args: SKETCH_ARGS }),
  ADD('sketch.circle3t', '3-Tangent Circle', { args: SKETCH_ARGS }),
  ADD('sketch.arc3p', '3-Point Arc', { args: SKETCH_ARGS }),
  ADD('sketch.arcCenter', 'Center Point Arc', { args: SKETCH_ARGS }),
  ADD('sketch.arcTangent', 'Tangent Arc', { args: SKETCH_ARGS }),
  ADD('sketch.polygonCircumscribed', 'Circumscribed Polygon', { args: SKETCH_ARGS }),
  ADD('sketch.polygonInscribed', 'Inscribed Polygon', { args: SKETCH_ARGS }),
  ADD('sketch.polygonEdge', 'Edge Polygon', { args: SKETCH_ARGS }),
  // drawn with one drag like VectorCraft (prompt 041); a click asks for the size
  ADD('sketch.dragRect', 'Rectangle Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragEllipse', 'Ellipse Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragPolygon', 'Polygon Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragLine', 'Line Segment Tool', { args: SKETCH_ARGS }),
  // more shapes with one drag (prompt 044)
  ADD('sketch.dragRoundRect', 'Rounded Rectangle Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragStar', 'Star Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragSpiral', 'Spiral Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragRectGrid', 'Rectangular Grid Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragPolarGrid', 'Polar Grid Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragArc', 'Arc Tool', { args: SKETCH_ARGS }),
  // only while dragging one of them (the "drawing" keys come before the canvas's)
  // the pen (prompt 042): click / drag points; Enter ends
  ADD('pen.tool', 'Pen', { args: PEN_ARGS }),
  ADD('pen.finish', 'Finish Path', { context: 'drawing', palette: false }),
  // the curvature tool (prompt 043): the curve runs through the clicks; edits the selected path
  ADD('curvature.tool', 'Curvature', { args: CURVATURE_ARGS }),
  ADD('curvature.removePoint', 'Remove Point (Curvature)', { context: 'drawing', palette: false }),
  ADD('sketch.sidesUp', 'Polygon: One Side More', {
    context: 'drawing',
    repeat: true,
    palette: false,
  }),
  ADD('sketch.sidesDown', 'Polygon: One Side Less', {
    context: 'drawing',
    repeat: true,
    palette: false,
  }),
  ADD('sketch.moveHold', 'Move the Shape Being Drawn (hold)', {
    context: 'drawing',
    hold: true,
    palette: false,
  }),
];
