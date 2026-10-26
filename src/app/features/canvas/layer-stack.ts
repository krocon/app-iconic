import { IconGroup, IconLayer } from '../../core/icon-file/icon-file.models';
import { AssetState, IconDocument } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { SVG_NS } from '../document/svg/node-ids';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { Appearance, specialized } from './appearance';
import { assetPlacement, layerTransform } from './asset-placement';

/** Styles inside every layer's shadow root (design 004 E2). */
const LAYER_CSS =
  ':host{position:absolute;inset:0;pointer-events:none}' +
  '.layer-host{display:block;position:absolute;inset:0;width:100%;height:100%}';

/** One layer to paint. */
export interface StackLayer {
  group: number;
  layer: number;
  asset: AssetState;
  opacity: number | null;
  transform: string | null;
  /** This layer shows the live root; others of the same asset get a copy (design 004 E5). */
  live: boolean;
}

export interface StackGroup {
  group: number;
  opacity: number | null;
  /** Bottom first. */
  layers: StackLayer[];
}

const opacityOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const hidden = (v: IconGroup | IconLayer) => v['hidden'] === true;

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
 * asset are left out. Pure (reads the document).
 */
export function stackOf(doc: IconDocument, appearance: Appearance): StackGroup[] {
  const seen = new Set<AssetState>();
  const top = groups(doc.iconJson).map((g, gi): StackGroup => {
    const ls = hidden(g)
      ? []
      : layers(g).flatMap((l, li): StackLayer[] => {
          const asset = hidden(l) ? undefined : layerAsset(doc, l, appearance);
          if (!asset || (!asset.svg && !asset.dataUrl)) return [];
          const live = !seen.has(asset);
          seen.add(asset);
          return [
            {
              group: gi,
              layer: li,
              asset,
              opacity: opacityOf(l.opacity),
              transform: layerTransform(l),
              live,
            },
          ];
        });
    return { group: gi, opacity: opacityOf(g['opacity']), layers: ls.reverse() };
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

  update(doc: IconDocument | null, appearance: Appearance): void {
    const stack = doc ? stackOf(doc, appearance) : [];
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
        g.layers.map((l) => [
          l.layer,
          l.asset.name,
          this.identity(l.asset.svg?.root ?? l.asset),
          l.opacity,
          l.transform,
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
    if (g.opacity !== null) el.style.opacity = String(g.opacity);
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
    const shadow = host.attachShadow({ mode: 'open' });
    const style = d.createElement('style');
    style.textContent = LAYER_CSS;
    const svg = d.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'layer-host');
    svg.setAttribute('viewBox', `0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`);
    const g = d.createElementNS(SVG_NS, 'g');
    if (l.opacity !== null) g.setAttribute('opacity', String(l.opacity));
    if (l.transform) g.setAttribute('transform', l.transform);
    g.append(l.asset.svg ? this.svgContent(l) : this.imageContent(l.asset.dataUrl ?? ''));
    svg.append(g);
    shadow.append(style, svg);
    return host;
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
