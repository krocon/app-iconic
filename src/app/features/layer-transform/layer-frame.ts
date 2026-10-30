import { IconJson } from '../../core/icon-file/icon-file.models';
import { Rect } from '../../shared/geometry/dom-geometry';
import { apply, invert, Matrix, multiply } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';
import { Appearance, appearanceKey, fieldFor } from '../canvas/appearance';
import { DocCommand } from '../document/commands';
import { groups, layers } from '../document/model/icon-json';
import { IconItem } from '../document/model/selection';
import { resolveSpecialized, specializedEdits } from '../document/model/specializations';
import { UndoLabel } from '../document/undo/undo-texts';
import { editsCommand, targetObject, targetPath } from '../inspector/inspector-edit';
import { LayerPosition, positionMatrix, positionValue, readPosition } from './layer-position';

export type LayerItem = Extract<IconItem, { kind: 'layer' }>;

/** Where a layer is drawn for an appearance (as `stackTransform` draws it): group outside, layer inside. */
export interface LayerPlacement {
  group: LayerPosition;
  layer: LayerPosition;
  /** Asset space → document (`G · L`). */
  matrix: Matrix;
}

/** The placement of `item`, `null` if it does not exist. Pure. */
export function layerPlacement(
  json: IconJson,
  item: LayerItem,
  appearance: Appearance,
): LayerPlacement | null {
  const g = groups(json)[item.group];
  const l = g ? layers(g)[item.layer] : undefined;
  if (!g || !l) return null;
  const group = readPosition(fieldFor(g, 'position', appearance, undefined));
  const layer = readPosition(fieldFor(l, 'position', appearance, undefined));
  return { group, layer, matrix: withLayer(group, layer) };
}

/** `G · L` for another layer position (while dragging). */
export function withLayer(group: LayerPosition, layer: LayerPosition): Matrix {
  return multiply(positionMatrix(group), positionMatrix(layer));
}

/** A rectangle in document units back into the asset space of a placement (uniform: stays a rectangle). */
export function toAssetSpace(m: Matrix, r: Rect): Rect | null {
  const inv = invert(m);
  if (!inv) return null;
  const a = apply(inv, { x: r.x, y: r.y });
  const b = apply(inv, { x: r.x + r.width, y: r.y + r.height });
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * The command that sets the layer's `position` for the edited appearance (design 080 E8, like the
 * inspector, 010 E3): the base value in light, else the appearance's entry; other keys of the
 * value stay. `null` if the layer does not exist.
 */
export function positionCommand(
  json: IconJson,
  item: LayerItem,
  appearance: Appearance,
  pos: LayerPosition,
  label: UndoLabel,
): DocCommand | null {
  const obj = targetObject(json, item);
  if (!obj) return null;
  const key = appearanceKey(appearance);
  const old = resolveSpecialized(obj, 'position', key, undefined).value;
  const edits = specializedEdits(obj, targetPath(item), 'position', key, positionValue(old, pos));
  return editsCommand(edits, label);
}

/** The asset-space point under document point `p` for a placement. */
export function assetPoint(m: Matrix, p: Point): Point | null {
  const inv = invert(m);
  return inv ? apply(inv, p) : null;
}
