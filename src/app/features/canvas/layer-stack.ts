import { CONSTRUCTION_CSS } from '../construction/construction';
import { IconGroup, IconLayer } from '../../core/icon-file/icon-file.models';
import { AssetState, IconDocument } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { SVG_NS } from '../document/svg/node-ids';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { Appearance, fieldFor, specialized } from './appearance';
import { assetPlacement } from './asset-placement';
import {
  blendCss,
  groupEffects,
  ShadowEffect,
  shadowFilter,
  stackScale,
  stackTransform,
  translucencyMask,
} from './effects';

/** Id of the shadow filter inside a layer's shadow root (own tree scope per layer). */
const SHADOW_ID = 'ai-fx-shadow';

/** Styles inside every layer's shadow root (design 004 E2). */
const LAYER_CSS =
  ':host{position:absolute;inset:0;pointer-events:none}' +
  '.layer-host{display:block;position:absolute;inset:0;width:100%;height:100%}' +
  '.layer-host.shadowed{will-change:transform}' +
  CONSTRUCTION_CSS;

/** One layer to paint. */
export interface StackLayer {
  group: number;
  layer: number;
  asset: AssetState;
  opacity: number | null;
  transform: string | null;
  /** CSS `mix-blend-mode` (design 010 E13). */
  blend: string | null;
  /** The group's shadow, drawn per layer (preview approximation, design 010 E13). */
  shadow: ShadowEffect | null;
  /** The scale of `transform` (group × layer) – for the composited shadow (prompt 033 E5). */
  scale: number;
  /** This layer shows the live root; others of the same asset get a copy (design 004 E5). */
  live: boolean;
}

export interface StackGroup {
  group: number;
  opacity: number | null;
  blend: string | null;
  /** Translucency amount (opacity gradient), `null` = none. */
  translucency: number | null;
  /** Bottom first. */
  layers: StackLayer[];
}

const opacityOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const hiddenFor = (v: IconGroup | IconLayer, a: Appearance) =>
  fieldFor(v, 'hidden', a, false) === true;

/** The asset a layer shows for `appearance` (`image-name-specializations` first). */
export function layerAsset(
  doc: IconDocument,
  layer: IconLayer,
  appearance: Appearance,
): AssetState | undefined {
  const name = specialized(layer['image-name-specializations'], appearance, layer['image-name']);
  return typeof name === 'string' ? doc.asset(name) : undefined;
}

/**
 * The paint order of the document (design 004 E3): first group / first layer of `icon.json` on
 * top, so the result is reversed (bottom first). Hidden groups and layers and layers without an
 * asset are left out. Values per appearance (design 010 E13); `effects` = the approximated group
 * effects (shadow, translucency, blend modes). Pure (reads the document).
 */
export function stackOf(doc: IconDocument, appearance: Appearance, effects = true): StackGroup[] {
  const seen = new Set<AssetState>();
  const top = groups(doc.iconJson).map((g, gi): StackGroup => {
    const fx = effects ? groupEffects(g, appearance) : null;
    const ls = hiddenFor(g, appearance)
      ? []
      : layers(g).flatMap((l, li): StackLayer[] => {
          const asset = hiddenFor(l, appearance) ? undefined : layerAsset(doc, l, appearance);
          if (!asset || (!asset.svg && !asset.dataUrl)) return [];
          const live = !seen.has(asset);
          seen.add(asset);
          return [
            {
              group: gi,
              layer: li,
              asset,
              opacity: opacityOf(fieldFor(l, 'opacity', appearance, null)),
              transform: stackTransform(g, l, appearance),
              blend: effects ? blendCss(fieldFor(l, 'blend-mode', appearance, 'normal')) : null,
              shadow: fx?.shadow ?? null,
              scale: stackScale(g, l, appearance),
              live,
            },
          ];
        });
    return {
      group: gi,
      opacity: opacityOf(fieldFor(g, 'opacity', appearance, null)),
      blend: fx?.blend ?? null,
      translucency: fx?.translucency ?? null,
      layers: ls.reverse(),
    };
  });
  return top.filter((g) => g.layers.length > 0).reverse();
}

/**
 * Paints the layers of a document into `box` (design 004 E2–E6): one container per group, per
 * layer a shadow root with its own host `<svg viewBox="0 0 1024 1024">` → `<g>` (opacity,
 * position) → placement `<svg>` → the LIVE root of the asset. Rebuilt only when the structure
 * changes; attribute changes show by themselves because the root is the document.
 */
export class LayerStack {
  private signature = '';
  private copies: { el: Element; source: Element; parent: Element }[] = [];
  private readonly ids = new WeakMap<object, number>();
  private idSeq = 0;

  constructor(private readonly box: HTMLElement) {}

  update(doc: IconDocument | null, appearance: Appearance, effects = true): void {
    const stack = doc ? stackOf(doc, appearance, effects) : [];
    const signature = this.signatureOf(stack);
    if (signature === this.signature) {
      this.refreshCopies();
      return;
    }
    this.signature = signature;
    this.copies = [];
    this.box.replaceChildren(...stack.map((g) => this.groupElement(g)));
  }

  private identity(o: object): number {
    let id = this.ids.get(o);
    if (id === undefined) this.ids.set(o, (id = ++this.idSeq));
    return id;
  }

  private signatureOf(stack: StackGroup[]): string {
    return JSON.stringify(
      stack.map((g) => [
        g.group,
        g.opacity,
        g.blend,
        g.translucency,
        g.layers.map((l) => [
          l.layer,
          l.asset.name,
          this.identity(l.asset.svg?.root ?? l.asset),
          l.opacity,
          l.transform,
          l.blend,
          l.shadow,
          l.live,
        ]),
      ]),
    );
  }

  private refreshCopies(): void {
    for (const c of this.copies) {
      const fresh = c.source.cloneNode(true) as Element;
      c.parent.replaceChild(fresh, c.el);
      c.el = fresh;
    }
  }

  private groupElement(g: StackGroup): HTMLElement {
    const d = this.box.ownerDocument;
    const el = d.createElement('div');
    el.className = 'group';
    el.dataset['group'] = String(g.group);
    // Sized here, not in canvas-view.css: its emulated encapsulation does not reach elements built
    // at run time. A static group is 0 px high, and WebKit (WKWebView, WebKitGTK) then masks the
    // whole group away under the translucency mask (bug from 010; Chromium painted it anyway).
    el.style.position = 'absolute';
    el.style.inset = '0';
    if (g.opacity !== null) el.style.opacity = String(g.opacity);
    if (g.blend) el.style.mixBlendMode = g.blend;
    if (g.layers.some((l) => l.blend)) el.style.isolation = 'isolate';
    if (g.translucency !== null) {
      const mask = translucencyMask(g.translucency);
      el.style.setProperty('mask-image', mask);
      el.style.setProperty('-webkit-mask-image', mask);
      el.dataset['translucency'] = String(g.translucency);
    }
    el.append(...g.layers.map((l) => this.layerElement(l)));
    return el;
  }

  private layerElement(l: StackLayer): HTMLElement {
    const d = this.box.ownerDocument;
    const host = d.createElement('div');
    host.className = 'layer';
    host.dataset['group'] = String(l.group);
    host.dataset['layer'] = String(l.layer);
    host.dataset['asset'] = l.asset.name;
    if (l.blend) host.style.mixBlendMode = l.blend;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = d.createElement('style');
    style.textContent = LAYER_CSS;
    const svg = d.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'layer-host');
    svg.setAttribute('viewBox', `0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`);
    const g = d.createElementNS(SVG_NS, 'g');
    if (l.opacity !== null) g.setAttribute('opacity', String(l.opacity));
    if (l.transform) g.setAttribute('transform', l.transform);
    if (l.shadow) {
      // composited (prompt 033 E5): a CSS filter on the layer's own compositor layer – a change
      // re-rasters only the changed tiles, the shadow is applied when compositing. An SVG filter
      // on the content re-rendered the whole layer on every drag step (~240 ms with 20 000 shapes).
      svg.append(this.shadowFilter(l.shadow, l.scale));
      svg.classList.add('shadowed');
      svg.style.filter = `url(#${SHADOW_ID})`;
    }
    g.append(l.asset.svg ? this.svgContent(l) : this.imageContent(l.asset.dataUrl ?? ''));
    svg.append(g);
    shadow.append(style, svg);
    return host;
  }

  /** The group's shadow for one layer (design 010 E13) in the layer's own shadow root. */
  private shadowFilter(s: ShadowEffect, scale: number): Element {
    const d = this.box.ownerDocument;
    const defs = d.createElementNS(SVG_NS, 'defs');
    defs.append(shadowFilter(d, SHADOW_ID, s, { scale }));
    return defs;
  }

  /** Placement `<svg>` (design 004 E4) with the live root or a copy of it. */
  private svgContent(l: StackLayer): Element {
    const root = l.asset.svg!.root;
    const place = this.box.ownerDocument.createElementNS(SVG_NS, 'svg');
    const p = assetPlacement(root);
    place.setAttribute('class', 'placement');
    for (const [k, v] of Object.entries(p)) place.setAttribute(k, String(v));
    if (l.live) {
      place.append(root);
    } else {
      const copy = root.cloneNode(true) as Element;
      place.append(copy);
      this.copies.push({ el: copy, source: root, parent: place });
    }
    return place;
  }

  /** PNG: natural size, centred (full canvas until decoded). */
  private imageContent(url: string): Element {
    const d = this.box.ownerDocument;
    const img = d.createElementNS(SVG_NS, 'image');
    const place = (w: number, h: number) => {
      img.setAttribute('x', String((CANVAS_SIZE - w) / 2));
      img.setAttribute('y', String((CANVAS_SIZE - h) / 2));
      img.setAttribute('width', String(w));
      img.setAttribute('height', String(h));
    };
    place(CANVAS_SIZE, CANVAS_SIZE);
    img.setAttribute('href', url);
    const probe = new Image();
    probe.onload = () => place(probe.naturalWidth, probe.naturalHeight);
    probe.src = url;
    return img;
  }
}
