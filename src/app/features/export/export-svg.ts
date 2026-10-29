import { stripConstraints } from '../constraints/constraint-storage';
import { stripConstruction } from '../construction/construction';
import { IconDocument } from '../document/icon-document';
import { elementsOf, stripInternal, SVG_NS } from '../document/svg/node-ids';
import { rewriteReferences } from '../document/svg/svg-references';
import { Appearance } from '../canvas/appearance';
import { assetPlacement } from '../canvas/asset-placement';
import { shadowFilter } from '../canvas/effects';
import { FillPreview, fillPreview } from '../canvas/fill-preview';
import { SvgColor, svgColor } from '../canvas/icon-color';
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
  /** Shadow, translucency and blend modes as approximation (design 012 E6). */
  effects: boolean;
  /** Keep the dimensions (`data-dimension`, prompt 048); default: left out. */
  dimensions?: boolean;
}

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

  maskGroup(): Element {
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
    el.append(l.asset.svg ? this.svgAsset(l.asset.svg.root, n) : this.image(l));
    return el;
  }

  private svgAsset(root: Element, n: number): Element {
    const place = this.el('svg', { ...assetPlacement(root) });
    const copy = this.d.importNode(root, true) as Element;
    stripInternal(copy);
    stripConstruction(copy);
    stripConstraints(copy);
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
  const target = b.maskGroup();
  const bg = b.background(fillPreview(doc.iconJson, appearance, svgColor).preview);
  if (bg) target.append(bg);
  for (const g of stackOf(doc, appearance, opts.effects)) target.append(b.group(g));
  if (!b.defs.hasChildNodes()) b.defs.remove();
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(b.d) + '\n'
  );
}
