import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PANEL_MAX, PANEL_MIN } from '../../core/settings/settings.models';
import { LayoutStore, PanelId } from './layout.store';
import { dragWidth, keyWidth, SplitterSide } from './panel-width';
import { SHELL_TEXTS } from './shell-texts';

/**
 * The splitter at the edge of a side panel (design 015 E10, WAI-ARIA APG "Window Splitter"):
 * `role="separator"` with the width as value, focusable. Drag to resize (pointer capture), ←/→
 * 10 px (⇧ 40 px), Home/End = smallest/largest, double-click or Enter = default width. Like a
 * slider it owns its keys (it handles them before the global dispatcher, design 005 E4).
 */
@Component({
  selector: 'app-splitter',
  template: `<span class="grip" aria-hidden="true"></span>`,
  styles: `
    :host {
      position: relative;
      flex: none;
      /* takes no room: the layout (and the canvas size) is as without splitters */
      width: 6px;
      margin: 0 -3px;
      z-index: 2;
      cursor: col-resize;
      touch-action: none;
      user-select: none;
      outline: none;
    }
    .grip {
      position: absolute;
      inset: 0 2px;
      background: transparent;
      transition: background-color 0.12s;
    }
    :host(:hover) .grip,
    :host(.dragging) .grip {
      background: var(--color-accent);
    }
    :host(:focus-visible) .grip {
      inset: 0 1px;
      background: var(--color-focus);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    '[attr.aria-label]': 'label()',
    '[attr.title]': 'hint()',
    '[attr.aria-valuenow]': 'width()',
    '[attr.aria-valuemin]': 'min',
    '[attr.aria-valuemax]': 'max',
    '[attr.data-panel]': 'panel()',
    '[class.dragging]': 'drag() !== null',
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up($event)',
    '(pointercancel)': 'up($event)',
    '(lostpointercapture)': 'drag.set(null)',
    '(dblclick)': 'layout.resetWidth(panel())',
    '(keydown)': 'key($event)',
  },
})
export class Splitter {
  readonly panel = input.required<PanelId>();
  /** `end` = right edge of a left panel, `start` = left edge of a right panel. */
  readonly side = input<SplitterSide>('end');
  /** The panel's heading (accessible name). */
  readonly name = input.required<string>();
  protected readonly layout = inject(LayoutStore);
  protected readonly min = PANEL_MIN;
  protected readonly max = PANEL_MAX;
  protected readonly t = SHELL_TEXTS;
  protected readonly width = computed(() => this.layout.widths()[this.panel()]);
  protected readonly label = computed(() => this.t.resize(this.name()));
  protected readonly hint = computed(() => this.t.resizeHint);
  protected readonly drag = signal<{ x: number; width: number; id: number } | null>(null);

  protected down(e: PointerEvent): void {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
    this.drag.set({ x: e.clientX, width: this.width(), id: e.pointerId });
  }

  protected move(e: PointerEvent): void {
    const d = this.drag();
    if (!d || d.id !== e.pointerId) return;
    this.layout.setWidth(this.panel(), dragWidth(d.width, e.clientX - d.x, this.side()));
  }

  protected up(e: PointerEvent): void {
    if (this.drag()?.id !== e.pointerId) return;
    this.drag.set(null);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  protected key(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      this.layout.resetWidth(this.panel());
      return;
    }
    const w = keyWidth(this.width(), e.key, e.shiftKey, this.side());
    if (w === null) return;
    e.preventDefault();
    this.layout.setWidth(this.panel(), w);
  }
}
