import { ChangeDetectionStrategy, Component, input, OnInit, signal } from '@angular/core';
import { INSPECTOR_TEXTS } from './inspector-texts';

/**
 * A collapsible section of the icon inspector (button with `aria-expanded`, like the sections of
 * the properties panel, design 009 E9); the rows are projected into its grid.
 */
@Component({
  selector: 'app-inspector-section',
  template: `
    <h3 class="title">
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="'insp-' + sectionId()"
        (click)="open.set(!open())"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path [attr.d]="open() ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'" />
        </svg>
        {{ heading() }}
      </button>
    </h3>
    @if (open()) {
      <div class="rows" [id]="'insp-' + sectionId()">
        <ng-content />
        @if (note(); as n) {
          <p class="note" role="note" [attr.data-note]="n">{{ t[n] }}</p>
        }
      </div>
    }
  `,
  styleUrl: './icon-inspector.css',
  host: { '[attr.data-section]': 'sectionId()', class: 'section' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectorSection implements OnInit {
  readonly sectionId = input.required<string>();
  readonly heading = input.required<string>();
  readonly note = input<'approximation' | 'notRendered' | undefined>(undefined);
  readonly initiallyOpen = input(true);
  protected readonly t = INSPECTOR_TEXTS;
  protected readonly open = signal(true);

  ngOnInit(): void {
    this.open.set(this.initiallyOpen());
  }
}
