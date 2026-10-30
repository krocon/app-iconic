import { effect, inject, Injectable, signal } from '@angular/core';
import { loadPaper, PaperScope } from '../../shared/geometry/pathops/boolean-ops';
import { Arrangement, insidePoint, unionOf } from '../../shared/geometry/pathops/faces';
import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { apply, fromDom, invert, Matrix } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import {
  AttributeChange,
  DocCommand,
  InsertNode,
  RemoveNode,
  SetAttributes,
} from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { sceneShapes } from '../trim/trim-scene';
import { bottomIndex, LIVE_FILL_ATTR, NOT_BOUNDARY, readSeeds, seedsJson } from './live-fill-model';

const SVG = 'http://www.w3.org/2000/svg';

/** A face found under the pointer: its asset and outline in document units. */
export interface FoundFace {
  asset: string;
  d: string;
}

/**
 * Live fills (prompt 060): fill the face the outlines enclose around a point – lines, arcs and
 * curves, closed or open, of one asset – and keep it up to date: a follower of the document
 * (`DocumentStore.setFollower`) recomputes every fill after each change, in the same undo step.
 * A fill whose face no longer closes keeps its last outline.
 */
@Injectable({ providedIn: 'root' })
export class LiveFillService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private scope: PaperScope | null = null;
  private cache: { revision: number; asset: string; a: Arrangement }[] = [];
  /**
   * Fills whose face no longer closes (`asset:id`, prompt 066): they keep their last outline; the
   * tree, the panel and the tool say so. Known after the first change since the start.
   */
  readonly stale = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => {
      const store = this.files.store();
      if (!store) return;
      // after the constraints (prompt 065): fills follow the solved geometry
      store.setFollower(() => this.follow(), 'liveFill', 20);
      if (this.hasFills(store.document())) void this.ready();
    });
  }

  ready(): Promise<PaperScope> {
    return loadPaper().then((s) => (this.scope = s));
  }

  private hasFills(doc: IconDocument): boolean {
    return [...doc.assets.values()].some((a) => a.svg?.root.querySelector(`[${LIVE_FILL_ATTR}]`));
  }

  private matrixOf(el: Element): Matrix | null {
    const host = this.view.host;
    if (!host || !(el instanceof SVGGraphicsElement)) return null;
    const m = nodeToDocument(host, el);
    return m ? fromDom(m) : null;
  }

  /** The outlines of an asset that bound faces (document units, measured now). */
  private arrangement(asset: string, fresh = false): Arrangement | null {
    const store = this.files.store();
    if (!store || !this.scope) return null;
    const revision = store.revision();
    if (!fresh) {
      const hit = this.cache.find((c) => c.revision === revision && c.asset === asset);
      if (hit) return hit.a;
    }
    const outlines = sceneShapes(store.document(), this.view.layers, this.view.host)
      .filter((s) => s.ref.asset === asset && !s.el.closest(NOT_BOUNDARY))
      .map((s) => s.d);
    const a = new Arrangement(this.scope, outlines, 0.01);
    if (!fresh) this.cache = [{ revision, asset, a }, ...this.cache.slice(0, 3)];
    return a;
  }

  /** The assets painted on the canvas, front first. */
  private assets(): string[] {
    const layers = this.view.layers;
    if (!layers) return [];
    const names = [...layers.querySelectorAll<HTMLElement>('.layer')]
      .reverse()
      .map((l) => l.dataset['asset'] ?? '');
    return [...new Set(names.filter(Boolean))];
  }

  /** The face under `p` (document units) of the frontmost asset that has one there. */
  faceAt(p: Point): FoundFace | null {
    for (const asset of this.assets()) {
      const d = this.arrangement(asset)?.faceAt(p);
      if (d) return { asset, d };
    }
    return null;
  }

  private transformD(d: string, m: Matrix): string {
    const p = new this.scope!.CompoundPath({ pathData: d, insert: false });
    p.transform(new this.scope!.Matrix(m.a, m.b, m.c, m.d, m.e, m.f));
    return p.pathData;
  }

  /** The fill element of `asset` that covers `p` (document units), front first. */
  fillAt(asset: string, p: Point): Element | null {
    const root = this.files.store()?.document().asset(asset)?.svg?.root;
    if (!root || !this.scope) return null;
    const fills = Array.from(root.querySelectorAll(`[${LIVE_FILL_ATTR}]`)).reverse();
    for (const el of fills) {
      const m = this.matrixOf(el);
      const inv = m && invert(m);
      if (!inv) continue;
      const q = apply(inv, p);
      const path = new this.scope.CompoundPath({
        pathData: el.getAttribute('d') ?? '',
        insert: false,
      });
      if (path.contains(new this.scope.Point(q.x, q.y))) return el;
    }
    return null;
  }

  /**
   * Fills the faces under `points` (document units) as one live fill with `color`; a click on a
   * filled face recolours that fill. `false` if no point is inside a closed face.
   */
  fill(points: readonly Point[], color: string): boolean {
    const store = this.files.store();
    if (!store || !this.scope || !points.length) return false;
    const first = this.faceAt(points[0]);
    if (!first) return false;
    const asset = first.asset;
    const doc = store.document();
    if (points.length === 1) {
      const el = this.fillAt(asset, points[0]);
      const ref = el && doc.refOf(el);
      if (ref) {
        store.execute(new SetAttributes([{ ref, name: 'fill', value: color }], 'fillRegion'));
        return true;
      }
    }
    const a = this.arrangement(asset)!;
    const faces: string[] = [];
    const seeds: Point[] = [];
    for (const p of points) {
      const d = a.faceAt(p);
      if (!d || faces.includes(d)) continue;
      faces.push(d);
      seeds.push(p);
    }
    const root = doc.asset(asset)?.svg?.root;
    const rootRef = root && doc.refOf(root);
    const m = root && this.matrixOf(root);
    const inv = m && invert(m);
    if (!root || !rootRef || !inv || !faces.length) return false;
    const d = this.transformD(unionOf(this.scope, faces), inv);
    const local = seeds.map((p) => apply(inv, p));
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const markup =
      `<path xmlns="${SVG}" ${LIVE_FILL_ATTR}="${esc(seedsJson(local))}" d="${esc(d)}" ` +
      `fill="${esc(color)}" stroke="none"/>`;
    store.execute(new InsertNode(rootRef, markup, bottomIndex(root), 'fillRegion'));
    return true;
  }

  /** Alt + click: the face under `p` leaves its fill (the whole fill if it was its only face). */
  remove(p: Point): boolean {
    const store = this.files.store();
    if (!store || !this.scope) return false;
    for (const asset of this.assets()) {
      const el = this.fillAt(asset, p);
      const ref = el && store.document().refOf(el);
      if (!el || !ref) continue;
      const seeds = readSeeds(el) ?? [];
      const m = this.matrixOf(el);
      const a = this.arrangement(asset);
      const face = a?.faceAt(p);
      const keep = m && a && face ? seeds.filter((s) => a.faceAt(apply(m, s)) !== face) : [];
      if (keep.length && keep.length < seeds.length) {
        store.execute(
          new SetAttributes([{ ref, name: LIVE_FILL_ATTR, value: seedsJson(keep) }], 'removeFill'),
        );
      } else store.execute(new RemoveNode(ref));
      return true;
    }
    return false;
  }

  /** The fills lose their live link and stay as plain paths. */
  detach(refs: readonly NodeRef[]): boolean {
    const store = this.files.store();
    if (!store) return false;
    const doc = store.document();
    const changes: AttributeChange[] = refs
      .filter((r) => doc.node(r)?.hasAttribute(LIVE_FILL_ATTR))
      .map((ref) => ({ ref, name: LIVE_FILL_ATTR, value: null }));
    if (!changes.length) return false;
    store.execute(new SetAttributes(changes, 'detachFill'));
    return true;
  }

  /**
   * The follower: every fill's face again from its seeds. Changed outlines and moved seeds in one
   * command; a fill whose seeds are no longer in a closed face stays as it was.
   */
  follow(): DocCommand | null {
    const store = this.files.store();
    if (!store || !this.scope) return null;
    const doc = store.document();
    const changes: AttributeChange[] = [];
    const stale = new Set<string>();
    for (const asset of doc.assets.values()) {
      const fills = asset.svg
        ? Array.from(asset.svg.root.querySelectorAll(`[${LIVE_FILL_ATTR}]`))
        : [];
      if (!fills.length) continue;
      const a = this.arrangement(asset.name, true);
      if (!a) continue;
      for (const el of fills) {
        const ref = doc.refOf(el);
        const seeds = readSeeds(el);
        const m = this.matrixOf(el);
        const inv = m && invert(m);
        if (!ref || !seeds || !m || !inv) continue;
        const faces = seeds.map((s) => a.faceAt(apply(m, s)));
        if (faces.some((f) => !f)) {
          stale.add(`${ref.asset}:${ref.id}`);
          continue;
        }
        const unique = [...new Set(faces as string[])];
        const d = this.transformD(unionOf(this.scope, unique), inv);
        if (d === el.getAttribute('d')) continue;
        const moved = (faces as string[]).map((f, i) => {
          const q = insidePoint(this.scope!, f);
          return q ? apply(inv, q) : seeds[i];
        });
        changes.push({ ref, name: 'd', value: d });
        changes.push({ ref, name: LIVE_FILL_ATTR, value: seedsJson(moved) });
      }
    }
    const before = this.stale();
    if (stale.size !== before.size || [...stale].some((k) => !before.has(k))) this.stale.set(stale);
    return changes.length ? new SetAttributes(changes, 'fillRegion') : null;
  }

  /** The fill no longer follows: its face is open (prompt 066). */
  isStale(ref: NodeRef): boolean {
    return this.stale().has(`${ref.asset}:${ref.id}`);
  }
}
