import { AttributeChange, DocCommand, SetAttributes } from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';

/**
 * Construction lines (prompt 049, like Fusion 360's construction geometry): a shape marked
 * `data-construction` is transparent in the file (`opacity="0"` – Icon Composer and every other
 * SVG viewer show nothing), drawn dashed blue on the canvas and left out of the export. It still
 * snaps, so it helps to construct. The attribute keeps the shape's own opacity for the way back.
 * Pure.
 */

export const CONSTRUCTION_ATTR = 'data-construction';
/** Shapes that can be construction geometry (leaves with an outline). */
export const CONSTRUCTION_TAGS: ReadonlySet<string> = new Set([
  'line',
  'rect',
  'circle',
  'ellipse',
  'polyline',
  'polygon',
  'path',
]);

/** How the canvas draws construction geometry (in the layers' shadow roots). */
export const CONSTRUCTION_CSS =
  `[${CONSTRUCTION_ATTR}]{opacity:1!important;fill:none!important;` +
  'stroke:var(--ai-construction,#0a84ff)!important;stroke-opacity:1!important;' +
  'stroke-width:1.5px!important;stroke-dasharray:6 4!important;vector-effect:non-scaling-stroke}' +
  // guides out of the rulers (prompt 056): solid
  '[data-guide]{stroke:var(--ai-guide-user,#00b4d8)!important;stroke-dasharray:none!important;stroke-width:1px!important}';

export const isConstruction = (el: Element) => el.hasAttribute(CONSTRUCTION_ATTR);

/**
 * Toggle of the selected shapes: all construction → normal again (their opacity back), else the
 * others become construction. `null` = no shape in the selection.
 */
export function constructionCommand(
  doc: IconDocument,
  refs: readonly NodeRef[],
): DocCommand | null {
  const els = refs.flatMap((ref) => {
    const el = doc.node(ref);
    return el && CONSTRUCTION_TAGS.has(el.localName) ? [{ ref, el }] : [];
  });
  if (!els.length) return null;
  const off = els.every((x) => isConstruction(x.el));
  const changes: AttributeChange[] = els.flatMap(({ ref, el }): AttributeChange[] => {
    if (off) {
      const before = el.getAttribute(CONSTRUCTION_ATTR) ?? '';
      return [
        { ref, name: CONSTRUCTION_ATTR, value: null },
        { ref, name: 'opacity', value: before === '' ? null : before },
      ];
    }
    if (isConstruction(el)) return [];
    return [
      { ref, name: CONSTRUCTION_ATTR, value: el.getAttribute('opacity') ?? '' },
      { ref, name: 'opacity', value: '0' },
    ];
  });
  return new SetAttributes(changes, 'toggleConstruction');
}

/** Removes the construction geometry from a copy (the export). In place. */
export function stripConstruction(root: Element): void {
  for (const el of Array.from(root.querySelectorAll(`[${CONSTRUCTION_ATTR}]`))) el.remove();
}
