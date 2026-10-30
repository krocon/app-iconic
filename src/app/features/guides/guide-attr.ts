/** Marks a guide (a construction line across the canvas, prompt 056); a module of its own so pure
 * code (tree labels, selection) can use it without the service. */
export const GUIDE_ATTR = 'data-guide';

/** `el` is a guide from the rulers. */
export function isGuide(el: Element): boolean {
  return el.hasAttribute(GUIDE_ATTR);
}
