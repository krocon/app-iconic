import { computed, Signal, signal } from '@angular/core';
import { SaveResult } from '../../core/icon-file/icon-file.models';
import { DocCommand } from './commands/command';
import { IconDocument, NodeRef } from './icon-document';
import { UndoService } from './undo/undo.service';
import { UndoLabel } from './undo/undo-texts';

/**
 * The state of one open document (design 003 E7): the document, its selection and undo. Every
 * change goes through `execute` (or a gesture) – nobody changes the DOM or `icon.json` directly.
 * A plain class (not DI): one per document, held by the `FilesService` of the window.
 */
export class DocumentStore {
  private readonly rev = signal(0);
  private readonly undoService: UndoService;

  /** The document; notifies on every change (`revision`). */
  readonly document = computed(
    () => {
      this.rev();
      return this.doc;
    },
    { equal: () => false },
  );
  readonly revision = this.rev.asReadonly();
  readonly selection = signal<readonly NodeRef[]>([]);

  readonly dirty: Signal<boolean>;
  readonly canUndo: Signal<boolean>;
  readonly canRedo: Signal<boolean>;
  readonly undoLabel: Signal<string>;
  readonly redoLabel: Signal<string>;
  /** A new document nobody touched – Open may replace it (design 003 E8). */
  readonly pristine: Signal<boolean>;
  /** Title of the window: file name or "Untitled". */
  readonly title: Signal<string | null>;

  constructor(private readonly doc: IconDocument) {
    this.undoService = new UndoService(doc, () => this.changed());
    const s = this.undoService.state;
    this.dirty = computed(() => s().dirty);
    this.canUndo = computed(() => s().canUndo);
    this.canRedo = computed(() => s().canRedo);
    this.undoLabel = computed(() => s().undoLabel);
    this.redoLabel = computed(() => s().redoLabel);
    this.pristine = computed(() => {
      this.rev();
      return doc.path === null && !s().canUndo && !s().canRedo;
    });
    this.title = computed(() => {
      this.rev();
      return doc.name;
    });
  }

  execute(command: DocCommand): void {
    this.undoService.execute(command);
  }

  undo(): void {
    if (this.undoService.undo()) this.pruneSelection();
  }

  redo(): void {
    if (this.undoService.redo()) this.pruneSelection();
  }

  begin(label: UndoLabel): void {
    this.undoService.begin(label);
  }

  update(command: DocCommand): void {
    this.undoService.update(command);
  }

  commit(): void {
    this.undoService.commit();
  }

  cancel(): void {
    this.undoService.cancel();
    this.pruneSelection();
  }

  markSaved(result: SaveResult): void {
    this.doc.markSaved(result);
    this.undoService.markSaved();
  }

  private changed(): void {
    this.doc.revision++;
    this.rev.set(this.doc.revision);
  }

  /** Refs to nodes that are gone after undo/redo leave the selection. */
  private pruneSelection(): void {
    const sel = this.selection();
    const kept = sel.filter((r) => this.doc.node(r) !== null);
    if (kept.length !== sel.length) this.selection.set(kept);
  }
}
