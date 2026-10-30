import { IconLayer } from '../../core/icon-file/icon-file.models';
import { Rect } from '../../shared/geometry/dom-geometry';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';

/** A length attribute in user units: a plain number or `px`; `null` for %, mm, em … */
function userLength(v: string | null): number | null {
  const m = v === null ? null : /^\s*([+]?\d*\.?\d+(?:e[+-]?\d+)?)\s*(px)?\s*$/i.exec(v);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function viewBoxSize(v: string | null): [number, number] | null {
  const nums = (v ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return nums.length === 4 && nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0
    ? [nums[2], nums[3]]
    : null;
}

/**
 * Where the canvas puts an asset of its own size (design 004 E4, like Icon Composer): centred and
 * unscaled, SVG units = points. Size from `width`/`height` (number or px), else the `viewBox`, else
 * the full canvas. Pure – only reads attributes, the asset is not changed.
 */
export function assetPlacement(root: Element, size = CANVAS_SIZE): Rect {
  const vb = viewBoxSize(root.getAttribute('viewBox'));
  let w = userLength(root.getAttribute('width'));
  let h = userLength(root.getAttribute('height'));
  if (vb && w === null && h === null) [w, h] = vb;
  else if (vb && w === null && h !== null) w = (h * vb[0]) / vb[1];
  else if (vb && h === null && w !== null) h = (w * vb[1]) / vb[0];
  const width = w ?? size;
  const height = h ?? size;
  return { x: (size - width) / 2, y: (size - height) / 2, width, height };
}

/** The `scale` of Icon Composer's layer `position` (1 without one). */
export function layerScale(layer: IconLayer): number {
  const pos = layer['position'];
  if (typeof pos !== 'object' || pos === null) return 1;
  const { scale } = pos as Record<string, unknown>;
  return typeof scale === 'number' && Number.isFinite(scale) ? scale : 1;
}

/**
 * Icon Composer's layer `position` (`scale`, `translation-in-points`) as SVG transform around the
 * canvas centre; `null` without one (design 004 E4, y down assumed – question 2).
 */
export function layerTransform(layer: IconLayer, size = CANVAS_SIZE): string | null {
  const pos = layer['position'];
  if (typeof pos !== 'object' || pos === null) return null;
  const { scale, 'translation-in-points': t } = pos as Record<string, unknown>;
  const s = typeof scale === 'number' && Number.isFinite(scale) ? scale : 1;
  const [tx, ty] =
    Array.isArray(t) && t.length === 2 && t.every((v) => typeof v === 'number') ? t : [0, 0];
  if (s === 1 && tx === 0 && ty === 0) return null;
  const c = size / 2;
  return `translate(${c + tx} ${c + ty}) scale(${s}) translate(${-c} ${-c})`;
}
