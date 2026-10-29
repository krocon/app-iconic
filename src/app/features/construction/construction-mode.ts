import { Injectable, signal } from '@angular/core';
import { UndoLabel } from '../document/undo/undo-texts';
import { CONSTRUCTION_ATTR, CONSTRUCTION_TAGS } from './construction';

/** What the construction mode leaves alone: guides, dimensions, images, text, imports, structure. */
const NOT_DRAWN: ReadonlySet<UndoLabel> = new Set<UndoLabel>([
  'addGuide',
  'addDimension',
  'addImage',
  'addSymbol',
  'addTextPath',
  'addSvgSnippet',
  'addText',
  'addContainer',
]);

/**
 * Draw as construction (prompt 058, Fusion's "Construction" switch): while it is on, every shape
 * a drawing tool adds is construction geometry at once (049) – no X afterwards. Per window, not
 * saved.
 */
@Injectable({ providedIn: 'root' })
export class ConstructionMode {
  readonly on = signal(false);

  /** `markups` as construction geometry when the mode is on and `label` is drawing. */
  apply(label: UndoLabel, markups: string[]): string[] {
    if (!this.on() || NOT_DRAWN.has(label)) return markups;
    return markups.map(asConstruction);
  }
}

/** The markup with every shape in it marked as construction (its own opacity kept). */
export function asConstruction(markup: string): string {
  const doc = new DOMParser().parseFromString(
    markup.includes('xmlns=')
      ? markup
      : markup.replace(/^<(\w+)/, '<$1 xmlns="http://www.w3.org/2000/svg"'),
    'image/svg+xml',
  );
  const root = doc.documentElement;
  if (root.querySelector('parsererror') || root.localName === 'parsererror') return markup;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!CONSTRUCTION_TAGS.has(el.localName) || el.hasAttribute(CONSTRUCTION_ATTR)) continue;
    el.setAttribute(CONSTRUCTION_ATTR, el.getAttribute('opacity') ?? '');
    el.setAttribute('opacity', '0');
  }
  return new XMLSerializer().serializeToString(root);
}
