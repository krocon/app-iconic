import { signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DropPosition, TreeTarget } from '../document/model/selection';
import { targetOf, TreeRow } from './hierarchy-model';

/** Movement before a press becomes a drag (px). */
const THRESHOLD = 4;
/** Distance from the edge of the list that scrolls it while dragging (px), and the step. */
const EDGE = 24;
const SCROLL_STEP = 12;

/** What the tree gives the drag controller. */
export interface DragHost {
  rows(): readonly TreeRow[];
  rowHeight(): number;
  /** The scrolling list. */
  list(): HTMLElement | null;
  /** What dragging `row` moves (it gets selected if it was not); `null` = nothing. */
  sourcesFor(row: TreeRow): TreeTarget[] | null;
  allowed(sources: TreeTarget[], target: TreeTarget, position: DropPosition): boolean;
  drop(sources: TreeTarget[], target: TreeTarget, position: DropPosition): void;
}

/** Where the insertion line (or the "into" frame) is drawn. */
export interface DropIndicator {
  index: number;
  position: DropPosition;
  level: number;
}

/**
 * Drag & drop of tree rows with pointer events (design 006 E7; no HTML5 drag API – Tauri takes
 * drag & drop for file drops): upper / lower quarter of a row = before / after, the middle = into
 * a container, else the nearer half. Only moves the rules of `checkReorder` allow are shown. Esc
 * cancels (the drag takes over `edit.deselect` while it runs).
 */
export class TreeDrag {
  readonly indicator = signal<DropIndicator | null>(null);
  readonly active = signal(false);
  /** A drag just ended – the click that follows must not change the selection. */
  suppressClick = false;
  private press: { x: number; y: number; id: number; row: TreeRow } | null = null;
  private sources: TreeTarget[] | null = null;
  private drop: { target: TreeTarget; position: DropPosition } | null = null;
  private releaseEsc: (() => void) | null = null;

  constructor(
    private readonly host: DragHost,
    private readonly actions: ActionService,
  ) {}

  down(e: PointerEvent, row: TreeRow): void {
    if (e.button !== 0 || !targetOf(row.node)) return;
    this.press = { x: e.clientX, y: e.clientY, id: e.pointerId, row };
  }

  move(e: PointerEvent): void {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    if (!this.active()) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < THRESHOLD) return;
      this.sources = this.host.sourcesFor(p.row);
      if (!this.sources) {
        this.press = null;
        return;
      }
      this.active.set(true);
      this.host.list()?.setPointerCapture?.(e.pointerId);
      // Esc ends the drag (the latest handler wins, design 005 E3)
      this.releaseEsc = this.actions.register('edit.deselect', { run: () => this.cancel() });
    }
    this.autoScroll(e.clientY);
    this.track(e.clientY);
  }

  up(e: PointerEvent): void {
    if (!this.press || this.press.id !== e.pointerId) return;
    const wasActive = this.active();
    const { sources, drop } = this;
    this.end(e.pointerId);
    if (!wasActive) return;
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false));
    if (sources && drop) this.host.drop(sources, drop.target, drop.position);
  }

  cancel(): void {
    this.end(this.press?.id ?? null);
  }

  private end(pointerId: number | null): void {
    if (pointerId !== null) this.host.list()?.releasePointerCapture?.(pointerId);
    this.press = null;
    this.sources = null;
    this.drop = null;
    this.active.set(false);
    this.indicator.set(null);
    this.releaseEsc?.();
    this.releaseEsc = null;
  }

  private autoScroll(clientY: number): void {
    const list = this.host.list();
    if (!list) return;
    const r = list.getBoundingClientRect();
    if (clientY < r.top + EDGE) list.scrollTop -= SCROLL_STEP;
    else if (clientY > r.bottom - EDGE) list.scrollTop += SCROLL_STEP;
  }

  private track(clientY: number): void {
    const list = this.host.list();
    const rows = this.host.rows();
    if (!list || !this.sources || !rows.length) return;
    const h = this.host.rowHeight();
    const y = clientY - list.getBoundingClientRect().top + list.scrollTop;
    const index = Math.max(0, Math.min(rows.length - 1, Math.floor(y / h)));
    const frac = Math.max(0, Math.min(1, y / h - index));
    const row = rows[index];
    const target = targetOf(row.node);
    const half: DropPosition = frac < 0.5 ? 'before' : 'after';
    const candidates: DropPosition[] =
      frac < 0.25 ? ['before'] : frac > 0.75 ? ['after'] : ['into', half];
    const position = target
      ? candidates.find((pos) => this.host.allowed(this.sources!, target, pos))
      : undefined;
    if (!target || !position) {
      this.drop = null;
      this.indicator.set(null);
      return;
    }
    this.drop = { target, position };
    this.indicator.set({ index, position, level: row.level });
  }
}
