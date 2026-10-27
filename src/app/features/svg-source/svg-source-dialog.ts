import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  InjectionToken,
  signal,
  viewChild,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { DEFAULT_FORMAT_PRECISION, formatFragment, formatSvg } from '../document/svg/svg-format';
import type { CodeEditorHandle, CodeEditorOptions } from './code-editor';
import { checkSource, offsetOf, SourceProblem } from './svg-source-check';
import { SVG_SOURCE_TEXTS } from './svg-source-texts';
import { SvgSourceService } from './svg-source.service';

export type CodeEditorFactory = (parent: HTMLElement, opts: CodeEditorOptions) => CodeEditorHandle;

/** Loads the editor (design 011 E1: CodeMirror as lazy chunk); tests give a plain one. */
export const CODE_EDITOR_LOADER = new InjectionToken<() => Promise<CodeEditorFactory>>(
  'CODE_EDITOR_LOADER',
  { factory: () => () => import('./code-editor').then((m) => m.createCodeEditor) },
);

const MAX_PRECISION = 6;

/**
 * "Edit SVG…" (design 011 E3–E7): the source of the target (node or asset) in CodeMirror, checked
 * live (`DOMParser`, lint marker + message), "Apply" only for valid, changed text – one undo step
 * "Edit SVG Code". "Format" formats with the chosen decimals. Mod-Enter = Apply; Esc / Cancel ask
 * inside the dialog when there are changes (the `DialogService` knows one dialog at a time).
 */
@Component({
  selector: 'app-svg-source-dialog',
  imports: [Modal],
  templateUrl: './svg-source-dialog.html',
  styleUrl: './svg-source-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'onKeydown($event)' },
})
export class SvgSourceDialog {
  protected readonly dialogs = inject(DialogService);
  private readonly service = inject(SvgSourceService);
  private readonly actions = inject(ActionService);
  private readonly loader = inject(CODE_EDITOR_LOADER);
  protected readonly t = SVG_SOURCE_TEXTS;
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('editorHost');
  private readonly keepButton = viewChild<ElementRef<HTMLButtonElement>>('keepButton');

  protected readonly target = this.service.editing();
  private readonly original = this.target ? (this.service.source(this.target) ?? '') : '';
  protected readonly subtitle = this.target ? this.service.title(this.target) : '';
  protected readonly text = signal(this.original);
  protected readonly state = signal<'loading' | 'ready' | 'fallback'>('loading');
  protected readonly failed = signal(false);
  protected readonly confirming = signal(false);
  protected readonly precision = signal(DEFAULT_FORMAT_PRECISION);
  private editor: CodeEditorHandle | null = null;

  protected readonly problem = computed<SourceProblem | null>(() =>
    this.target ? checkSource(this.text(), this.target.kind) : null,
  );
  protected readonly dirty = computed(() => this.text() !== this.original);
  protected readonly canApply = computed(
    () => !!this.target && this.dirty() && !this.problem() && this.state() !== 'loading',
  );
  protected readonly message = computed(() => {
    if (this.failed()) return this.t.applyFailed;
    const p = this.problem();
    if (p) return this.describe(p);
    return this.dirty() ? this.t.valid : this.t.unchanged;
  });
  protected readonly applyTitle = this.t.applyHint(this.actions.os === 'mac' ? '⌘↩' : 'Ctrl+Enter');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => void this.mount());
    destroyRef.onDestroy(() => this.editor?.destroy());
  }

  private describe(p: SourceProblem): string {
    const k = this.t.problems;
    return p.kind === 'syntax' ? k.syntax(p.line, p.column, p.detail) : k[p.kind];
  }

  private async mount(): Promise<void> {
    if (!this.target) return;
    try {
      const create = await this.loader();
      this.editor = create(this.host().nativeElement, {
        text: this.text(),
        label: this.t.editorLabel,
        onChange: (text) => {
          this.failed.set(false);
          this.text.set(text);
          this.syncProblem();
        },
        onApply: () => this.apply(),
      });
      this.state.set('ready');
      this.syncProblem();
      this.editor.focus();
    } catch {
      this.state.set('fallback');
    }
  }

  private syncProblem(): void {
    const p = this.problem();
    if (!this.editor) return;
    if (!p) {
      this.editor.setProblem(null);
      return;
    }
    const text = this.text();
    // one character wide, also at the very end (a mark there would have no width)
    const from = Math.max(0, Math.min(offsetOf(text, p.line, p.column), text.length - 1));
    this.editor.setProblem({ from, to: from + 1, message: this.describe(p) });
  }

  protected onFallbackInput(e: Event): void {
    this.failed.set(false);
    this.text.set((e.target as HTMLTextAreaElement).value);
  }

  protected onPrecision(e: Event): void {
    const v = Math.round(Number((e.target as HTMLInputElement).value));
    if (Number.isFinite(v)) this.precision.set(Math.max(0, Math.min(MAX_PRECISION, v)));
  }

  protected format(): void {
    const opts = { precision: this.precision() };
    // a node is a fragment (namespaces of the asset), an asset a file with its prolog
    const next =
      this.target?.kind === 'node'
        ? formatFragment(this.text(), opts)
        : formatSvg(this.text(), opts);
    if (next === null) return;
    if (this.editor) this.editor.setText(next);
    else this.text.set(next);
  }

  protected apply(): void {
    if (!this.target || !this.canApply()) return;
    const result = this.service.apply(this.target, this.text());
    if (result === 'ok') this.dialogs.close();
    else this.failed.set(true);
  }

  /** Esc / Cancel / backdrop: ask first when there are changes (E7). */
  protected requestClose(): void {
    if (this.confirming()) {
      this.confirming.set(false);
      this.editor?.focus();
      return;
    }
    if (!this.dirty()) {
      this.dialogs.close();
      return;
    }
    this.confirming.set(true);
    setTimeout(() => this.keepButton()?.nativeElement.focus());
  }

  protected keepEditing(): void {
    this.confirming.set(false);
    this.editor?.focus();
  }

  protected discard(): void {
    this.dialogs.close();
  }

  protected onKeydown(e: KeyboardEvent): void {
    // Mod-Enter outside the editor (the editor's own keymap handles it there, E7)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.defaultPrevented) {
      e.preventDefault();
      this.apply();
    }
  }
}
