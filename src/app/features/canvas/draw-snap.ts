import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { gridOriginPoint, SnapCandidate, snapPoint } from '../../shared/geometry/snapping';
import { Point } from '../../shared/geometry/view-transform';
import { FilesService } from '../files/files.service';
import { CanvasEditStore, shownSnap } from './canvas-edit.store';
import { CanvasViewStore } from './canvas-view.store';
import { snapCandidates, SnapSources } from './magic-points';

/**
 * Snapping for the points a drawing tool places (pen, curvature, measure …; like VectorCraft's
 * `DrawSnap`): grid, Magic Snap on the shapes and their crossings, Smart Guides on their outlines
 * and from the last point, the tool's own points – gathered once per document revision. ⌥ = off.
 * Shows the indicator.
 */
export class DrawSnap {
  private cache: { revision: number; sources: SnapSources } | null = null;

  constructor(
    private readonly view: CanvasViewStore,
    private readonly edit: CanvasEditStore,
    private readonly files: FilesService,
  ) {}

  /** The document point of `e`, snapped. */
  point(
    e: { clientX: number; clientY: number; altKey: boolean },
    own: readonly Point[] = [],
    from: Point | null = null,
  ): Point {
    const host = this.view.host;
    if (!host) return { x: 0, y: 0 };
    const raw = clientToDocument(host, e);
    const o = this.view.options();
    const off = e.altKey;
    const sources = this.sources();
    const r = snapPoint(raw, [...sources.points, ...own], {
      zoom: this.view.zoom(),
      grid: o.snapToGrid && !off,
      magic: o.magicSnap && !off,
      smart: o.magicSnap && o.smartGuides && !off,
      origin: gridOriginPoint(o.gridOrigin),
      step: o.gridSize,
      scene: { outlines: sources.outlines, from },
    });
    this.edit.snap.set(shownSnap(r));
    return r.point;
  }

  /** The raw document point of `e` (no snapping). */
  raw(e: { clientX: number; clientY: number }): Point {
    return this.view.host ? clientToDocument(this.view.host, e) : { x: 0, y: 0 };
  }

  clear(): void {
    this.edit.snap.set(null);
  }

  private sources(): SnapSources {
    const store = this.files.store();
    const o = this.view.options();
    if (!store || !o.magicSnap || !this.view.layers) return { points: [], outlines: [] };
    const revision = store.revision();
    if (this.cache?.revision !== revision) {
      const sources: SnapSources = snapCandidates(
        this.view.layers,
        this.view.host,
        store.document(),
        [],
        null,
        o.smartGuides,
      );
      this.cache = { revision, sources };
    }
    return this.cache.sources;
  }
}

export type { SnapCandidate };
