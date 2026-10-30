import { stripLiveFills } from '../live-fill/live-fill-model';
import { stripConstraints } from '../constraints/constraint-storage';
import { stripConstruction } from '../construction/construction';
import { IconDocument } from '../document/icon-document';
import { elementsOf, stripInternal, SVG_NS } from '../document/svg/node-ids';
import { rewriteReferences } from '../document/svg/svg-references';
import { Appearance } from '../canvas/appearance';
import { assetPlacement } from '../canvas/asset-placement';
import { shadowFilter } from '../canvas/effects';
import { FillPreview, fillPreview } from '../canvas/fill-preview';
import { glassFilter } from '../canvas/glass';
import { IconColor, SvgColor, svgColor } from '../canvas/icon-color';
import { FILL_RECT, gradientElement } from '../canvas/layer-fill';
import { DEFAULT_TINT, tintFilter } from '../canvas/tinted';
import { StackGroup, StackLayer, stackOf } from '../canvas/layer-stack';
import { MaskShape } from '../canvas/canvas-view.store';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { squirclePath } from '../../shared/geometry/squircle';

/**
 * The icon as one flat SVG per appearance (design 012 E1–E7), built from the same sources as the
 * canvas (`stackOf`, `fillPreview`) with the same structure – background, groups bottom first,
 * per layer `<g opacity transform>` → placement `<svg>` → a copy of the asset root – so the
 * geometry is the canvas's. Self-contained for resvg: ids per layer prefixed, `data-ai-*` gone,
 * colours as sRGB hex. The document is not changed.
 */

export interface ExportSvgOptions {
  /** Platform mask as `clipPath` (design 012 E5). */
  mask: MaskShape;
  /** Shadow, translucency, blend modes and glass as approximation (design 012 E6, 077 E6). */
  effects: boolean;
  /** The tint of the `tinted` appearance (`#rrggbb`, prompt 077 E2); default white. */
  tint?: string;
  /** Keep the dimensions (`data-dimension`, prompt 048); default: left out. */
  dimensions?: boolean;
  /**
   * `macos`: Apple's macOS template (prompt 078 E4) – the icon scaled into the 824-unit squircle
   * with 100 units margin and a drop shadow; replaces `mask`.
   */
  frame?: 'macos' | null;
}

/** macOS template on 1024 units (Apple: 824 × 824 shape, 100 margin, shadow 28 blur, 12 down, 50 % black). */
export const MACOS_FRAME = {
  inset: 100,
  body: 824,
  shadowDy: 12,
  shadowBlur: 28,
  shadowOpacity: 0.5,
};

/** Natural pixel size of raster assets by name (design 012 E7). */
export type RasterSizes = ReadonlyMap<string, { width: number; height: number }>;

const ID = 'ai-export-';
const URL_IN_TEXT = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;
const HASH_IN_TEXT = /#([A-Za-z_][\w-]*)/g;

/**
 * Prefixes every `id` of the subtree with `prefix`; references follow (`url(#…)` in attributes and
 * `style`, `href`/`xlink:href`, and `url(#…)`/`#id` selectors inside `<style>`). In place.
 */
export function prefixIds(root: Element, prefix: string): void {
  const map = new Map<string, string>();
  for (const el of elementsOf(root)) {
    const id = el.getAttribute('id');
    if (id) {
      map.set(id, prefix + id);
      el.setAttribute('id', prefix + id);
    }
  }
  rewriteReferences(root, map);
  for (const style of elementsOf(root).filter((e) => e.localName === 'style')) {
    const text = style.textContent ?? '';
    const next = text
      .replace(URL_IN_TEXT, (all, q: string, id: string) =>
        map.has(id) ? `url(${q}#${map.get(id)}${q})` : all,
      )
      .replace(HASH_IN_TEXT, (all, id: string) => (map.has(id) ? `#${map.get(id)}` : all));
    if (next !== text) style.textContent = next;
  }
}

class Builder {
  readonly d = document.implementation.createDocument(SVG_NS, 'svg', null);
  readonly root = this.d.documentElement;
  readonly defs = this.el('defs');
  private layerCount = 0;

  constructor(
    private readonly opts: ExportSvgOptions,
    private readonly raster: RasterSizes,
  ) {}

  el(name: string, attrs: Record<string, string | number | null> = {}): Element {
    const e = this.d.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) if (v !== null) e.setAttribute(k, String(v));
    return e;
  }

  background(fill: FillPreview<SvgColor>): Element | null {
    if (fill.kind === 'none') return null;
    const rect = this.el('rect', {
      class: `${ID}background`,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
    });
    if (fill.kind === 'solid') {
      rect.setAttribute('fill', fill.color.hex);
      if (fill.color.opacity < 1) rect.setAttribute('fill-opacity', String(fill.color.opacity));
      return rect;
    }
    const grad =
      fill.kind === 'linear'
        ? this.el('linearGradient', {
            x1: fill.start.x,
            y1: fill.start.y,
            x2: fill.stop.x,
            y2: fill.stop.y,
          })
        : this.el('radialGradient', { cx: fill.center.x, cy: fill.center.y, r: fill.radius });
    grad.setAttribute('id', `${ID}fill`);
    const n = fill.stops.length;
    fill.stops.forEach((c, i) => {
      grad.append(
        this.el('stop', {
          offset: n > 1 ? i / (n - 1) : 0,
          'stop-color': c.hex,
          'stop-opacity': c.opacity < 1 ? c.opacity : null,
        }),
      );
    });
    this.defs.append(grad);
    rect.setAttribute('fill', `url(#${ID}fill)`);
    return rect;
  }

  /** The macOS frame: shadow around a scaled, squircle-clipped group (E4 of design 078). */
  macosFrame(): Element {
    const f = MACOS_FRAME;
    const shadow = this.el('filter', {
      id: `${ID}frame-shadow`,
      filterUnits: 'userSpaceOnUse',
      x: 0,
      y: 0,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      'color-interpolation-filters': 'sRGB',
    });
    // a blur "radius" of design tools is about two standard deviations
    shadow.append(
      this.el('feDropShadow', {
        dx: 0,
        dy: f.shadowDy,
        stdDeviation: f.shadowBlur / 2,
        'flood-color': '#000',
        'flood-opacity': f.shadowOpacity,
      }),
    );
    const clip = this.el('clipPath', { id: `${ID}mask` });
    clip.append(this.el('path', { d: squirclePath() }));
    this.defs.append(shadow, clip);
    const outer = this.el('g', { class: `${ID}frame`, filter: `url(#${ID}frame-shadow)` });
    const inner = this.el('g', {
      transform: `translate(${f.inset} ${f.inset}) scale(${f.body / CANVAS_SIZE})`,
      'clip-path': `url(#${ID}mask)`,
    });
    outer.append(inner);
    this.root.append(outer);
    return inner;
  }

  maskGroup(): Element {
    if (this.opts.frame === 'macos') return this.macosFrame();
    if (this.opts.mask === 'none') return this.root;
    const clip = this.el('clipPath', { id: `${ID}mask` });
    clip.append(
      this.opts.mask === 'circle'
        ? this.el('circle', { cx: CANVAS_SIZE / 2, cy: CANVAS_SIZE / 2, r: CANVAS_SIZE / 2 })
        : this.el('path', { d: squirclePath() }),
    );
    this.defs.append(clip);
    const g = this.el('g', { 'clip-path': `url(#${ID}mask)` });
    this.root.append(g);
    return g;
  }

  group(g: StackGroup): Element {
    const el = this.el('g', { class: `${ID}group`, opacity: g.opacity });
    const style: string[] = [];
    if (g.blend) style.push(`mix-blend-mode:${g.blend}`);
    if (g.layers.some((l) => l.blend)) style.push('isolation:isolate');
    if (style.length) el.setAttribute('style', style.join(';'));
    if (g.translucency !== null) el.setAttribute('mask', `url(#${this.translucency(g)})`);
    el.append(...g.layers.map((l) => this.layer(l)));
    return el;
  }

  /** Opacity gradient (design 010 E13) as an SVG alpha mask: opaque top, `1 − v/2` bottom. */
  private translucency(g: StackGroup): string {
    const id = `${ID}translucency-${g.group}`;
    const grad = this.el('linearGradient', { id: `${id}-gradient`, x1: 0, y1: 0, x2: 0, y2: 1 });
    const bottom = Math.round((1 - (g.translucency ?? 0) / 2) * 1000) / 1000;
    grad.append(
      this.el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 1 }),
      this.el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': bottom }),
    );
    const mask = this.el('mask', {
      id,
      'mask-type': 'alpha',
      maskUnits: 'userSpaceOnUse',
      x: 0,
      y: 0,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
    });
    mask.append(
      this.el('rect', { width: CANVAS_SIZE, height: CANVAS_SIZE, fill: `url(#${id}-gradient)` }),
    );
    this.defs.append(grad, mask);
    return id;
  }

  layer(l: StackLayer): Element {
    const n = ++this.layerCount;
    const el = this.el('g', { class: `${ID}layer`, opacity: l.opacity, transform: l.transform });
    if (l.blend) el.setAttribute('style', `mix-blend-mode:${l.blend}`);
    if (l.shadow) {
      const filter = shadowFilter(this.d, `${ID}shadow-${n}`, l.shadow);
      filter.removeAttribute('data-kind');
      this.defs.append(filter);
      el.setAttribute('filter', `url(#${ID}shadow-${n})`);
    }
    let inner = el;
    if (l.glass) {
      const id = `${ID}glass-${n}`;
      const filter = glassFilter(this.d, id, l.glass);
      filter.removeAttribute('data-kind');
      this.defs.append(filter);
      inner = this.el('g', { filter: `url(#${id})` });
      el.append(inner);
    }
    const content = l.asset.svg ? this.svgAsset(l.asset.svg.root, n) : this.image(l);
    inner.append(l.fill ? this.layerFill(l.fill, content, n) : content);
    return el;
  }

  /**
   * Layer fill (prompt 077 E1): the content as an alpha mask, the fill as a big rect in layer
   * space – plain SVG 1.1 for resvg and other tools.
   */
  private layerFill(fill: FillPreview<IconColor>, content: Element, n: number): Element {
    const id = `${ID}layer-fill-${n}`;
    const mask = this.el('mask', {
      id: `${id}-mask`,
      'mask-type': 'alpha',
      maskUnits: 'userSpaceOnUse',
      ...FILL_RECT,
    });
    mask.append(content);
    const rect = this.el('rect', { ...FILL_RECT });
    if (fill.kind === 'solid') {
      const c = svgColor(fill.color);
      rect.setAttribute('fill', c.hex);
      if (c.opacity < 1) rect.setAttribute('fill-opacity', String(c.opacity));
    } else if (fill.kind !== 'none') {
      this.defs.append(
        gradientElement(this.d, id, fill, (ic) => {
          const c = svgColor(ic);
          return { 'stop-color': c.hex, 'stop-opacity': c.opacity < 1 ? c.opacity : null };
        }),
      );
      rect.setAttribute('fill', `url(#${id})`);
    }
    this.defs.append(mask);
    const g = this.el('g', { mask: `url(#${id}-mask)` });
    g.append(rect);
    return g;
  }

  /** The tinted approximation (prompt 077 E2) around background and groups. */
  tinted(target: Element): Element {
    this.defs.append(tintFilter(this.d, `${ID}tint`, this.opts.tint ?? DEFAULT_TINT));
    const g = this.el('g', { class: `${ID}tinted`, filter: `url(#${ID}tint)` });
    target.append(g);
    return g;
  }

  private svgAsset(root: Element, n: number): Element {
    const place = this.el('svg', { ...assetPlacement(root) });
    const copy = this.d.importNode(root, true) as Element;
    stripInternal(copy);
    stripConstruction(copy);
    stripConstraints(copy);
    stripLiveFills(copy);
    if (!this.opts.dimensions) {
      for (const dim of Array.from(copy.querySelectorAll('[data-dimension]'))) dim.remove();
    }
    prefixIds(copy, `l${n}-`);
    place.append(copy);
    return place;
  }

  private image(l: StackLayer): Element {
    const size = this.raster.get(l.asset.name) ?? { width: CANVAS_SIZE, height: CANVAS_SIZE };
    return this.el('image', {
      x: (CANVAS_SIZE - size.width) / 2,
      y: (CANVAS_SIZE - size.height) / 2,
      width: size.width,
      height: size.height,
      href: l.asset.dataUrl ?? '',
    });
  }
}

/** The export SVG of `doc` for `appearance` (pure apart from building DOM nodes). */
export function exportSvg(
  doc: IconDocument,
  appearance: Appearance,
  opts: ExportSvgOptions,
  raster: RasterSizes = new Map(),
): string {
  const b = new Builder(opts, raster);
  for (const [k, v] of Object.entries({
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    viewBox: `0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`,
  })) {
    b.root.setAttribute(k, String(v));
  }
  b.root.append(b.defs);
  const masked = b.maskGroup();
  const target = appearance === 'tinted' ? b.tinted(masked) : masked;
  const bg = b.background(fillPreview(doc.iconJson, appearance, svgColor).preview);
  if (bg) target.append(bg);
  for (const g of stackOf(doc, appearance, opts.effects)) target.append(b.group(g));
  if (!b.defs.hasChildNodes()) b.defs.remove();
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(b.d) + '\n'
  );
}
