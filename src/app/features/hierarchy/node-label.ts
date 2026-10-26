import { IconGroup, IconLayer } from '../../core/icon-file/icon-file.models';
import { HIERARCHY_TEXTS as T } from './hierarchy-texts';

/** Names of tree rows (design 006 E3): `id`, else element name + a short hint. Pure. */

const MAX_TEXT = 24;

function num(el: Element, name: string): string | null {
  const v = el.getAttribute(name)?.trim();
  return v ? v.replace(/px$/, '') : null;
}

function short(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat;
}

/** The hint after the element name (`10 × 20`, `r 5`, `“Hello”`). */
function hint(el: Element): string | null {
  switch (el.localName) {
    case 'rect': {
      const w = num(el, 'width');
      const h = num(el, 'height');
      return w && h ? `${w} × ${h}` : null;
    }
    case 'circle': {
      const r = num(el, 'r');
      return r ? `r ${r}` : null;
    }
    case 'ellipse': {
      const rx = num(el, 'rx');
      const ry = num(el, 'ry');
      return rx && ry ? `${rx} × ${ry}` : null;
    }
    case 'text':
    case 'tspan':
    case 'textPath': {
      const t = short(el.textContent ?? '');
      return t ? `“${t}”` : null;
    }
    case 'use': {
      const href =
        el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      return href ? `→ ${short(href)}` : null;
    }
    case 'g':
    case 'a':
    case 'switch':
    case 'defs':
    case 'clipPath':
    case 'mask':
    case 'symbol':
      return el.children.length ? `· ${el.children.length}` : null;
    default:
      return null;
  }
}

export function nodeLabel(el: Element): string {
  const id = el.getAttribute('id')?.trim();
  if (id) return short(id);
  const h = hint(el);
  return h ? `${el.localName} ${h}` : el.localName;
}

export function groupLabel(g: IconGroup, index: number): string {
  const name = g['name'];
  return typeof name === 'string' && name.trim() ? name : T.group(index + 1);
}

export function layerLabel(l: IconLayer): string {
  if (typeof l.name === 'string' && l.name.trim()) return l.name;
  return typeof l['image-name'] === 'string' ? l['image-name'] : T.layer;
}
