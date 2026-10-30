import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { APPEARANCE_LIST } from '../canvas/appearance';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { ActionService } from '../../core/actions/action.service';
import { SCENE_SCALES, SceneId } from './mockup-scenes';
import { MockupsService } from './mockups.service';
import { MOCKUPS_TEXTS as T } from './mockups-texts';

/**
 * "In Context" (prompt 081, View › In Context): a popover beside the canvas – it stays usable –
 * with every scene in its real size (points = CSS pixels), the appearance per scene, copy/save as
 * PNG and an own background image. Every control runs an action (AI, keyboard).
 */
@Component({
  selector: 'app-mockups-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.title" width="37rem" height="80vh" (closed)="dialogs.close()">
      <div class="bar" data-testid="mockups">
        <label class="scale">
          <span>{{ t.scale }}</span>
          <select
            data-autofocus
            [value]="service.scale()"
            (change)="setScale($any($event.target).value)"
          >
            @for (s of scales; track s) {
              <option [value]="s" [selected]="s === service.scale()">{{ t.scaleOption(s) }}</option>
            }
          </select>
        </label>
        <button type="button" class="btn" (click)="run('mockups.background')">
          {{ t.background }}
        </button>
        @if (service.background()) {
          <button type="button" class="btn" (click)="run('mockups.clearBackground')">
            {{ t.clearBackground }}
          </button>
        }
      </div>
      <p class="hint">{{ t.backgroundHint }}</p>
      <div class="scenes">
        @for (s of service.scenes(); track s.id) {
          <section
            class="scene"
            [attr.data-testid]="'scene-' + s.id"
            [attr.data-appearance]="s.appearance"
            [attr.aria-labelledby]="'mockup-' + s.id"
            (focusin)="service.current.set(s.id)"
          >
            <div class="head">
              <h3 [id]="'mockup-' + s.id">{{ t.scenes[s.id] }}</h3>
              <span class="size">{{ t.size(s.iconSize, unit(s.id)) }}</span>
            </div>
            <div class="seg" role="radiogroup" [attr.aria-label]="t.appearance">
              @for (a of appearances; track a) {
                <label class="opt">
                  <input
                    type="radio"
                    [name]="'mockup-appearance-' + s.id"
                    [value]="a"
                    [checked]="s.appearance === a"
                    (change)="run('mockups.appearance', { scene: s.id, appearance: a })"
                  />
                  {{ t.appearances[a] }}
                </label>
              }
            </div>
            <div class="stage" [style.min-height.px]="s.height">
              @if (s.url; as url) {
                <img [src]="url" [width]="s.width" [height]="s.height" [alt]="s.title" />
              } @else {
                <span
                  class="empty"
                  role="img"
                  [attr.aria-label]="s.title"
                  [style.width.px]="s.width"
                  [style.height.px]="s.height"
                ></span>
              }
            </div>
            <div class="actions">
              <button type="button" class="btn" (click)="run('mockups.copyPng', { scene: s.id })">
                {{ t.copy }}
              </button>
              <button type="button" class="btn" (click)="run('mockups.savePng', { scene: s.id })">
                {{ t.save }}
              </button>
            </div>
          </section>
        }
      </div>
    </app-modal>
  `,
  styles: `
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .scale {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }
    .hint,
    .size {
      margin: 0;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .scenes {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .scene {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
      & h3 {
        margin: 0;
        font-size: inherit;
        font-weight: 600;
      }
    }
    .seg {
      display: flex;
      gap: var(--space-3);
    }
    .opt {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }
    .stage {
      overflow-x: auto;
      & img {
        display: block;
        max-width: none;
        border-radius: var(--radius);
      }
    }
    .empty {
      display: block;
      background: var(--color-surface-2);
      border-radius: var(--radius);
    }
    .actions {
      display: flex;
      gap: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockupsDialog {
  protected readonly dialogs = inject(DialogService);
  protected readonly service = inject(MockupsService);
  private readonly actions = inject(ActionService);
  protected readonly t = T;
  protected readonly appearances = APPEARANCE_LIST;
  protected readonly scales = SCENE_SCALES;

  protected run(id: string, args?: Record<string, unknown>): void {
    void this.actions.run(id, args);
  }

  protected setScale(value: string): void {
    this.run('mockups.scale', { scale: Number(value) });
  }

  /** Windows sizes are pixels at 100 %, Apple sizes points. */
  protected unit(id: SceneId): string {
    return id === 'taskbar' ? 'px' : 'pt';
  }
}
