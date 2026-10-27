import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { DocumentStore } from '../document/document.store';
import { changedLines, formatIconJson } from './icon-json-text';
import { IconInspectorService } from './icon-inspector.service';
import { INSPECTOR_TEXTS } from './inspector-texts';

/**
 * "icon.json Preview" (design 010 E12): the live text in Icon Composer's format, read-only,
 * monospace, copyable; the lines of the last change are marked and scrolled into view.
 */
@Component({
  selector: 'app-json-preview',
  template: `
    <div class="bar">
      <button type="button" class="btn quiet" data-testid="json-copy" (click)="copy()">
        {{ copied() ? t.copied : t.copy }}
      </button>
    </div>
    <pre
      class="json"
      tabindex="0"
      data-testid="json-preview"
      [attr.aria-label]="t.sections.json"
    ><code>@for (l of lines(); track $index) {<span class="line" [class.changed]="isChanged($index)">{{ l }}
</span>}</code></pre>
  `,
  styles: `
    :host {
      display: block;
    }
    .bar {
      display: flex;
      justify-content: flex-end;
      padding-bottom: var(--space-1);
    }
    .btn {
      height: 22px;
      padding: 0 var(--space-2);
      font-size: var(--font-size-small);
    }
    .json {
      margin: 0;
      max-height: 22rem;
      overflow: auto;
      padding: var(--space-1);
      font-family: var(--font-mono);
      font-size: var(--font-size-small);
      line-height: 1.45;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 4px;
      user-select: text;

      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: 1px;
      }
    }
    .line {
      display: block;
      min-height: 1lh;
      white-space: pre;
    }
    .changed {
      background: var(--color-selection);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonPreview {
  readonly store = input<DocumentStore | null>(null);
  private readonly icon = inject(IconInspectorService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = INSPECTOR_TEXTS;
  protected readonly copied = signal(false);
  /** The text shown before (a plain field: only the computed below reads and writes it). */
  private previous: { store: DocumentStore | null; text: string } | null = null;

  protected readonly text = computed(() => {
    const s = this.store();
    return s ? formatIconJson(s.document().iconJson) : '';
  });
  private readonly view = computed(() => {
    const text = this.text();
    const store = this.store();
    const p = this.previous;
    this.previous = { store, text };
    return {
      lines: text.split('\n'),
      changed: p && p.store === store ? changedLines(p.text, text) : null,
    };
  });
  protected readonly lines = computed(() => this.view().lines);
  private readonly changed = computed(() => this.view().changed);

  constructor() {
    afterRenderEffect(() => {
      if (!this.changed()) return;
      const el = this.host.nativeElement.querySelector('.changed');
      el?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  protected isChanged(i: number): boolean {
    const c = this.changed();
    return !!c && i >= c.from && i < c.to;
  }

  protected async copy(): Promise<void> {
    this.copied.set(await this.icon.copyJson());
    setTimeout(() => this.copied.set(false), 1500);
  }
}
