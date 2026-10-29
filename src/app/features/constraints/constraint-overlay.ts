import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CONSTRAINT_TYPES, ConstraintType } from '../../shared/geometry/constraints/constraints';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { FilesService } from '../files/files.service';
import { ConstraintService } from './constraint.service';
import { ConstraintTool } from './constraint-tool';
import { CONSTRAINT_TEXTS as T } from './constraint-texts';
import { DrivingDimension, GLYPHS, overlayItems } from './constraint-view';

/**
 * Constraints on the canvas (prompt 059): a badge per relation, the driving dimensions (click the
 * value to change it – the geometry follows), and while the tool is on its bar of relations and
 * dimensions, the constrained points and what is picked.
 */
@Component({
  selector: 'app-constraint-overlay',
  templateUrl: './constraint-overlay.html',
  styleUrl: './constraint-overlay.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConstraintOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly tool = inject(ConstraintTool);
  private readonly service = inject(ConstraintService);
  private readonly files = inject(FilesService);
  private readonly actions = inject(ActionService);
  protected readonly t = T;
  protected readonly types = CONSTRAINT_TYPES;
  protected readonly glyphs = GLYPHS;
  protected readonly editing = signal<DrivingDimension | null>(null);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly injector = inject(Injector);

  protected readonly items = computed(() => {
    const store = this.files.store();
    if (!store || (!this.tool.visible() && !this.tool.on())) return { badges: [], dims: [] };
    store.revision();
    const v = this.toView();
    const out = {
      badges: [] as ReturnType<typeof overlayItems>['badges'],
      dims: [] as DrivingDimension[],
    };
    for (const asset of this.service.assets()) {
      const s = this.service.snapshot(asset);
      if (!s) continue;
      const it = overlayItems(asset, s.list, s.at, v);
      out.badges.push(...it.badges);
      out.dims.push(...it.dims);
    }
    return out;
  });

  protected readonly points = computed(() => {
    const v = this.toView();
    return this.tool.points().map((p) => apply(v, p.point!));
  });

  /** The hovered and picked entities in viewport pixels. */
  protected readonly marks = computed(() => {
    const v = this.toView();
    const V = (p: { x: number; y: number }) => apply(v, p);
    const k = Math.hypot(v.a, v.b) || 1;
    const hover = this.tool.hover();
    return [
      ...this.tool.picks().map((t) => ({ t, picked: true })),
      ...(hover ? [{ t: hover, picked: false }] : []),
    ].map(({ t, picked }) => ({
      picked,
      point: t.point && V(t.point),
      line: t.line && { a: V(t.line.a), b: V(t.line.b) },
      circle: t.circle && { c: V(t.circle.c), r: t.circle.r * k },
    }));
  });

  protected isSelected(asset: string, id: string): boolean {
    const s = this.tool.selected();
    return s?.asset === asset && s.id === id;
  }

  protected chooseType(type: ConstraintType): void {
    this.actions.run('constraint.tool', { type });
  }

  protected select(e: Event, asset: string, id: string): void {
    e.stopPropagation();
    this.tool.selected.set({ asset, id });
  }

  protected badgeKey(e: KeyboardEvent, asset: string, id: string): void {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    e.preventDefault();
    e.stopPropagation();
    this.actions.run('constraint.remove', { asset, id });
  }

  protected edit(e: Event, d: DrivingDimension): void {
    e.stopPropagation();
    this.tool.selected.set({ asset: d.asset, id: d.id });
    this.editing.set(d);
    afterNextRender(
      () => {
        const f = this.field()?.nativeElement;
        f?.focus();
        f?.select();
      },
      { injector: this.injector },
    );
  }

  protected fieldKey(e: KeyboardEvent): void {
    const d = this.editing();
    if (!d) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const value = Number((e.target as HTMLInputElement).value.replace(',', '.'));
      if (Number.isFinite(value)) {
        this.actions.run('constraint.setValue', { asset: d.asset, id: d.id, value });
      }
      this.editing.set(null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.editing.set(null);
    }
  }

  protected stop(e: Event): void {
    e.stopPropagation();
  }
}
