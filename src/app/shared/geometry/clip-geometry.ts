/**
 * Geometry of clip paths with the browser's matrices (design 014 E8, E9). A shape inside a
 * `<clipPath>` has no place of its own in the picture: it is drawn in the user space of the element
 * that REFERENCES the clip (`userSpaceOnUse`), or in its bounding box (`objectBoundingBox`), then
 * the `transform` of the `<clipPath>` and of the shape. Chromium answers `getScreenCTM()` of such a
 * shape as if the `<clipPath>` stood where it is in the tree (measured) – wrong for every user with
 * a transform. So this module composes the browser's own matrices – the user's screen CTM, its
 * `getBBox()`, the parsed `transform.baseVal` – and nothing else (no transform chain of our own).
 * Needs layout: tested in Playwright.
 */

const URL = /^url\(\s*(['"]?)#([^'")\s]+)\1\s*\)$/;
const STYLE_DECL = /(?:^|;)\s*clip-path\s*:\s*([^;]+)/i;
/** Elements that paint nothing; their content never uses a clip on the canvas. */
const NOT_PAINTING = new Set([
  'defs',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'symbol',
  'linearGradient',
  'radialGradient',
  'filter',
]);

/** The clip id an element itself refers to (`style` first, then the attribute), `null` if none. */
export function clipIdIn(el: Element): string | null {
  const style = (el as Partial<ElementCSSInlineStyle>).style?.getPropertyValue?.('clip-path');
  const decl = STYLE_DECL.exec(el.getAttribute('style') ?? '')?.[1];
  const v = (style?.trim() || decl?.trim() || el.getAttribute('clip-path') || '').trim();
  return URL.exec(v)?.[2] ?? null;
}

/** The `<clipPath>` that `el` lies in (or is), `null` outside. */
export function enclosingClipPath(el: Element): Element | null {
  for (let e: Element | null = el; e; e = e.parentElement) if (e.localName === 'clipPath') return e;
  return null;
}

function inDefinition(el: Element): boolean {
  for (let e: Element | null = el; e; e = e.parentElement)
    if (NOT_PAINTING.has(e.localName)) return true;
  return false;
}

/** The `<clipPath id>` in the tree scope of `near` (its shadow root or document). */
export function clipPathById(near: Element, id: string): Element | null {
  const scope = near.getRootNode() as ParentNode;
  for (const c of scope.querySelectorAll?.('clipPath') ?? [])
    if (c.getAttribute('id') === id) return c;
  return null;
}

/**
 * The element the clip's coordinates refer to on the canvas (design 014 E7): the first painting
 * element of its tree scope that uses it, `null` if nothing that paints uses it.
 */
export function clipOwnerOf(clip: Element): SVGGraphicsElement | null {
  const id = clip.getAttribute('id');
  if (!id) return null;
  const scope = clip.getRootNode() as ParentNode;
  for (const el of scope.querySelectorAll?.('*') ?? []) {
    if (el instanceof SVGGraphicsElement && !inDefinition(el) && clipIdIn(el) === id) return el;
  }
  return null;
}

function own(el: Element): DOMMatrix | null {
  const list = (el as SVGGraphicsElement).transform?.baseVal;
  const m = list?.consolidate?.()?.matrix;
  return m ? DOMMatrix.fromMatrix(m) : null;
}

/** `objectBoundingBox`: the bounding box of the user as matrix (else identity). */
function unitsOf(clip: Element, user: SVGGraphicsElement): DOMMatrix | null {
  if (clip.getAttribute('clipPathUnits')?.trim() !== 'objectBoundingBox') return new DOMMatrix();
  try {
    const b = user.getBBox();
    return new DOMMatrix([b.width, 0, 0, b.height, b.x, b.y]);
  } catch {
    return null;
  }
}

/**
 * Clip space of `clip` as used by `user` → screen, then down to `el` (a shape of the clip, or the
 * `<clipPath>` itself): `user.getScreenCTM() · clip.transform · units · transforms down to el`.
 */
export function clipToScreen(
  user: SVGGraphicsElement,
  clip: Element,
  el: Element = clip,
): DOMMatrix | null {
  const base = user.getScreenCTM?.();
  const units = unitsOf(clip, user);
  if (!base || !units) return null;
  let m = DOMMatrix.fromMatrix(base);
  const ct = own(clip);
  if (ct) m = m.multiply(ct);
  m = m.multiply(units);
  const chain: Element[] = [];
  for (let e: Element | null = el; e && e !== clip; e = e.parentElement) chain.unshift(e);
  for (const e of chain) {
    const t = own(e);
    if (t) m = m.multiply(t);
  }
  return m;
}

/** Clip shape (or `<clipPath>`) → document units for the canvas host, via the clip's owner. */
export function clipSpaceToDocument(host: SVGSVGElement, el: Element): DOMMatrix | null {
  const clip = enclosingClipPath(el);
  const owner = clip ? clipOwnerOf(clip) : null;
  const h = host.getScreenCTM();
  const m = owner && clip ? clipToScreen(owner, clip, el) : null;
  return h && m ? h.inverse().multiply(m) : null;
}

/** The client point lies in the shape (fill area; text, images, `use`: their box). */
function shapeContains(
  shape: SVGGraphicsElement,
  toScreen: DOMMatrix,
  x: number,
  y: number,
): boolean {
  const p = new DOMPoint(x, y).matrixTransform(toScreen.inverse());
  try {
    if (shape instanceof SVGGeometryElement) return shape.isPointInFill(p);
    const b = shape.getBBox();
    return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  } catch {
    return false;
  }
}

/** The topmost shape of `clip` (used by `user`) under the client point, `null` if none. */
export function clipShapeAt(
  user: SVGGraphicsElement,
  clip: Element,
  x: number,
  y: number,
): SVGGraphicsElement | null {
  for (const s of Array.from(clip.children).reverse()) {
    if (!(s instanceof SVGGraphicsElement)) continue;
    const m = clipToScreen(user, clip, s);
    if (m && shapeContains(s, m, x, y)) return s;
  }
  return null;
}

/**
 * The client point survives every clip that cuts `el` (its own and its ancestors' up to `root`,
 * design 014 E9). Clips that do not resolve are ignored (the element paints unclipped then).
 */
export function insideClips(el: Element, root: Element, x: number, y: number): boolean {
  for (let e: Element | null = el; e; e = e === root ? null : e.parentElement) {
    const id = clipIdIn(e);
    if (!id || !(e instanceof SVGGraphicsElement)) continue;
    const clip = clipPathById(e, id);
    if (clip && !clipShapeAt(e, clip, x, y)) return false;
  }
  return true;
}
