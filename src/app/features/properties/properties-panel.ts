import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DocumentStore } from '../document/document.store';
import { swatchOf } from '../hierarchy/swatch';
import { panelModel, PanelRow } from './panel-model';
import { PropertiesService } from './properties.service';
import { PROPERTIES_TEXTS } from './properties-texts';
import { PropertyRow } from './property-row';
import { SectionId } from './property-spec';
import { TransformEditor } from './transform-editor';
import { BoxSection } from './box-section';
import { ConstraintSection } from '../constraints/constraint-section';
import { LiveFillSection } from '../live-fill/live-fill-section';
import { IconInspector } from '../inspector/icon-inspector';
import { itemTitle } from '../inspector/inspector-title';
import { ClipPathSection } from '../clip/clip-path-section';
import { AlignSection } from '../align/align-section';
import { GradientSection } from '../gradient/gradient-section';

/**
 * The properties panel (design 009 E9): header with the kind of the selection, Undo / Redo and
 * "Reset All…"; the common properties of the selection by section (from the property specs, not
 * hand-written); the transform list; the empty state. One selected root, group or layer shows the
 * icon inspector (design 010).
 */
@Component({
  selector: 'app-properties-panel',
  imports: [
    AlignSection,
    BoxSection,
    ConstraintSection,
    LiveFillSection,
    GradientSection,
    ClipPathSection,
    IconInspector,
    PropertyRow,
    TransformEditor,
  ],
  template: `
    <div class="head">
      <span class="kind" data-testid="properties-kind">{{ title() }}</span>
      <span class="spacer"></span>
      <button
        type="button"
        class="tool"
        data-testid="properties-undo"
        [title]="actions.tooltip('edit.undo')"
        [attr.aria-label]="actions.label('edit.undo')"
        [disabled]="!actions.enabled('edit.undo')"
        (click)="actions.run('edit.undo')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 4L3 7l3 3M3 7h6a4 4 0 0 1 0 8H7" />
        </svg>
      </button>
      <button
        type="button"
        class="tool"
        data-testid="properties-redo"
        [title]="actions.tooltip('edit.redo')"
        [attr.aria-label]="actions.label('edit.redo')"
        [disabled]="!actions.enabled('edit.redo')"
        (click)="actions.run('edit.redo')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 4l3 3-3 3M13 7H7a4 4 0 0 0 0 8h2" />
        </svg>
      </button>
      <button
        type="button"
        class="btn quiet reset-all"
        data-testid="properties-reset-all"
        [disabled]="!actions.enabled('properties.resetAll')"
        (click)="actions.run('properties.resetAll')"
      >
        {{ t.resetAll }}
      </button>
    </div>
    <div class="body">
      @if (model(); as m) {
        <app-box-section [store]="store()" />
        <app-live-fill-section />
        @for (s of m.sections; track s.section) {
          <section class="section" [attr.data-section]="s.section">
            <h3 class="section-title">
              <button
                type="button"
                class="toggle"
                [attr.aria-expanded]="isOpen(s.section)"
                [attr.aria-controls]="'props-' + s.section"
                (click)="toggle(s.section)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path [attr.d]="isOpen(s.section) ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'" />
                </svg>
                {{ t.sections[s.section] }}
              </button>
            </h3>
            @if (isOpen(s.section)) {
              <div class="rows" [id]="'props-' + s.section">
                @if (s.section === 'transform') {
                  <app-transform-editor
                    class="wide"
                    fieldId="props-transform"
                    [elements]="m.elements"
                    [revision]="revision()"
                  />
                } @else {
                  @for (r of s.rows; track r.def.name) {
                    <app-property-row
                      [row]="r"
                      [fieldId]="'prop-' + r.def.name"
                      [swatch]="swatch(r, m.elements[0])"
                    />
                  }
                }
              </div>
            }
          </section>
        }
      } @else if (item(); as it) {
        <app-icon-inspector [store]="store()!" [target]="it" />
      } @else if (hasItems()) {
        <p class="empty" data-testid="properties-items">{{ t.iconItems }}</p>
      } @else {
        <div class="empty" data-testid="properties-empty">
          <p class="strong">{{ t.nothingSelected }}</p>
          <p>{{ t.nothingSelectedHint }}</p>
        </div>
      }
      <app-constraint-section />
      <app-align-section />
      <app-gradient-section />
      <app-clip-path-section />
      @if (actions.enabled('edit.editSvg') || actions.enabled('path.optimize')) {
        <div class="source-tools">
          @for (id of sourceActions; track id) {
            @if (actions.enabled(id)) {
              <button
                type="button"
                class="btn"
                [attr.data-testid]="'properties-' + id"
                [title]="actions.tooltip(id)"
                (click)="actions.run(id)"
              >
                {{ actions.label(id) }}
              </button>
            }
          }
        </div>
      }
    </div>
  `,
  styleUrl: './properties-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesPanel {
  readonly store = input<DocumentStore | null>(null);
  protected readonly actions = inject(ActionService);
  protected readonly props = inject(PropertiesService);
  protected readonly t = PROPERTIES_TEXTS;
  /** "Edit SVG…" and "Optimize Path…" (design 011 E13). */
  protected readonly sourceActions = ['edit.editSvg', 'path.optimize'] as const;
  private readonly open = signal<Record<SectionId, boolean>>({
    geometry: true,
    appearance: true,
    stroke: true,
    text: true,
    transform: true,
    advanced: false,
  });

  protected readonly revision = computed(() => this.store()?.revision() ?? 0);
  protected readonly model = computed(() => {
    const s = this.store();
    if (!s) return null;
    return panelModel(s.document(), s.selection());
  });
  protected readonly hasItems = computed(() => (this.store()?.items().length ?? 0) > 0);
  /** The one selected root / group / layer: the icon inspector (design 010). */
  protected readonly item = computed(() => {
    const items = this.store()?.items() ?? [];
    return items.length === 1 ? items[0] : null;
  });
  protected readonly title = computed(() => {
    const it = this.item();
    const s = this.store();
    if (it && s) return itemTitle(s.document().iconJson, it);
    const m = this.model();
    if (!m) return '';
    return m.count === 1 ? m.kind : this.t.items(m.count);
  });

  protected isOpen(s: SectionId): boolean {
    return this.open()[s];
  }

  protected toggle(s: SectionId): void {
    this.open.update((o) => ({ ...o, [s]: !o[s] }));
  }

  /** Gradient stops of a `url(#…)` fill / stroke (the tree's swatch, design 006 E3). */
  protected swatch(r: PanelRow, el: Element): string | null {
    const name = r.def.name;
    if (name !== 'fill' && name !== 'stroke') return null;
    const root = this.rootOf(el);
    const s = root ? swatchOf(el, name, root) : null;
    return s?.kind === 'gradient' || s?.kind === 'color' ? s.css : null;
  }

  private rootOf(el: Element): Element | null {
    const store = this.store();
    if (!store) return null;
    for (const a of store.document().assets.values()) {
      if (a.svg?.root.contains(el)) return a.svg.root;
    }
    return null;
  }
}
