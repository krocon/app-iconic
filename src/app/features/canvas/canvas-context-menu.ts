import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { FilesService } from '../files/files.service';
import { ContextMenu } from '../hierarchy/context-menu';
import { ContextEntry, contextMenuFor } from '../menus/context-menu-model';
import { CanvasEditStore } from './canvas-edit.store';
import { CanvasTools } from './canvas-tools';
import { CanvasViewStore } from './canvas-view.store';
import { CANVAS_TEXTS } from './canvas-texts';
import { hitTest, selectableRef } from './hit-test';
import { documentToClient } from '../../shared/geometry/dom-geometry';

/**
 * The context menu of the canvas (prompt 070): a right click (macOS also Ctrl+click) on an element
 * that is not selected selects it first (the hit test of a click, design 007 E2 – locked elements
 * are not hit), then opens the menu for the selection; on the empty canvas the canvas menu, while
 * a tool is on the tool's. ⇧F10 / the context menu key open it at the selection (`canvas.menu`).
 * The entries are the shared model (`contextMenuFor`), run through the action service.
 */
@Component({
  selector: 'app-canvas-context-menu',
  imports: [ContextMenu],
  template: `
    @if (menu(); as m) {
      <!-- inside the viewport: its pointer handlers must not see clicks in the menu -->
      <app-context-menu
        (pointerdown)="$event.stopPropagation()"
        (pointerup)="$event.stopPropagation()"
        (contextmenu)="$event.stopPropagation(); $event.preventDefault()"
        [entries]="m.entries"
        [at]="m.at"
        [label]="t.menu"
        (chosen)="choose($event)"
        (closed)="close()"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasContextMenu {
  private readonly actions = inject(ActionService);
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly edit = inject(CanvasEditStore);
  private readonly tools = inject(CanvasTools);
  protected readonly t = CANVAS_TEXTS.context;
  protected readonly menu = signal<{
    at: { x: number; y: number };
    entries: ContextEntry[];
  } | null>(null);
  private returnFocus: HTMLElement | null = null;

  constructor() {
    this.actions.register(
      'canvas.menu',
      {
        run: () => this.openAtSelection(),
        enabled: () => !!this.files.store(),
      },
      inject(DestroyRef),
    );
  }

  /** The viewport's `contextmenu` event. */
  open(e: MouseEvent): void {
    e.preventDefault();
    const store = this.files.store();
    if (!store) return;
    this.returnFocus = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    if (this.tools.anyActive()) {
      this.show(e.clientX, e.clientY, contextMenuFor('tool'));
      return;
    }
    const box = this.view.layers;
    const hit = box ? hitTest(box, e) : null;
    const sel = hit ? selectableRef(store.document(), hit, this.edit.context()) : null;
    if (sel && !store.selection().some((r) => r.asset === sel.ref.asset && r.id === sel.ref.id)) {
      store.select([sel.ref]);
    }
    // a click beside every element: the canvas menu (the selection stays as it is)
    this.show(e.clientX, e.clientY, contextMenuFor(sel ? 'nodes' : 'empty'));
  }

  /** ⇧F10: at the selection's box (or the middle of the canvas). */
  openAtSelection(): boolean {
    const store = this.files.store();
    const host = this.view.host;
    if (!store || !host) return false;
    this.returnFocus =
      host.closest('app-canvas-view')?.querySelector<HTMLElement>('.viewport') ?? null;
    if (this.tools.anyActive()) {
      const r = host.getBoundingClientRect();
      this.show(r.left + 24, r.top + 24, contextMenuFor('tool'));
      return true;
    }
    const box = this.edit.model().union;
    const p = box
      ? documentToClient(host, { x: box.x + box.width, y: box.y + box.height })
      : documentToClient(host, { x: 512, y: 512 });
    this.show(p.clientX, p.clientY, contextMenuFor(store.selection().length ? 'nodes' : 'empty'));
    return true;
  }

  private show(x: number, y: number, entries: ContextEntry[]): void {
    this.menu.set({ at: { x, y }, entries });
  }

  protected close(): void {
    this.menu.set(null);
    const f = this.returnFocus;
    this.returnFocus = null;
    if (f) setTimeout(() => f.focus());
  }

  protected choose(e: ContextEntry): void {
    this.close();
    this.actions.run(e.id, e.args);
  }
}
