import { computed, Signal, signal } from '@angular/core';
import { SaveResult } from '../../core/icon-file/icon-file.models';
import { DocCommand } from './commands/command';
import { CommandJson } from './commands/command-json';
import { commandFromJson } from './commands/registry';
import { IconDocument, NodeRef } from './icon-document';
import { groups, layers } from './model/icon-json';
import { IconItem } from './model/selection';
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
  /** The last command of a coalescing series (design 007 E12). */
  private series: { key: string; at: number; command: DocCommand } | null = null;

  /** The document; notifies on every change (`revision`). */
  readonly document = computed(
    () => {
      this.rev();
      return this.doc;
    },
    { equal: () => false },
  );
  readonly revision = this.rev.asReadonly();
  /** Selected SVG nodes – the one selection of canvas and tree (design 003 E7, 006 E5). */
  readonly selection = signal<readonly NodeRef[]>([]);
  /** Selected root / groups / layers (design 006 E5); excludes `selection` and vice versa. */
  readonly items = signal<readonly IconItem[]>([]);

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
    this.pruneSelection();
  }

  /**
   * Runs `command`; a command of the same series (`key`, e.g. nudges of the same selection) within
   * `windowMs` of the previous one joins its undo step (design 007 E12: arrow keys, ~500 ms).
   */
  executeCoalescing(command: DocCommand, key: string, windowMs = 500, now = Date.now()): void {
    const s = this.series;
    const into = s && s.key === key && now - s.at < windowMs ? s.command : null;
    const merged = this.undoService.executeInto(command, into);
    this.series = { key, at: now, command: merged && s ? s.command : command };
    this.pruneSelection();
  }

  /** A gesture is running (between `begin` and `commit`/`cancel`). */
  get inGesture(): boolean {
    return this.undoService.inGesture;
  }

  /**
   * Runs a command given as JSON (design 005 E15 – the AI path of prompt 018, `edit.runCommand`).
   * Throws `CommandError` for invalid JSON or a missing target; nothing is changed then.
   */
  runCommand(json: unknown): void {
    this.execute(commandFromJson(json));
  }

  /** Where the undo stack is now (design 018 E10). */
  undoMark(): number {
    return this.undoService.mark();
  }

  /** Every step since `mark` becomes one step of the AI ("Undo AI: …"). */
  groupSince(mark: number): boolean {
    const grouped = this.undoService.groupSince(mark);
    if (grouped) this.pruneSelection();
    return grouped;
  }

  /** The undo title now ("Undo AI: Add Circle") – what the AI is told after a write. */
  get undoTitle(): string | null {
    return this.canUndo() ? this.undoLabel() : null;
  }

  /** The last undoable step as JSON (design 005 E15; the AI can see what happened). */
  lastCommandJson(): CommandJson | null {
    return this.undoService.top?.toJSON() ?? null;
  }

  /** Selects SVG nodes (and no icon items). */
  select(refs: readonly NodeRef[]): void {
    this.items.set([]);
    this.selection.set(refs);
  }

  /** Selects icon items (and no nodes). */
  selectItems(items: readonly IconItem[]): void {
    this.selection.set([]);
    this.items.set(items);
  }

  clearSelection(): void {
    this.selection.set([]);
    this.items.set([]);
  }

  undo(): void {
    if (this.undoService.undo()) this.pruneSelection();
  }

  redo(): void {
    if (this.undoService.redo()) this.pruneSelection();
  }

  /**
   * A gesture is running (reactive): views that rebuild from the whole document (the tree) can wait
   * for its end – a drag changes only attributes (prompt 031, 20 000 nodes).
   */
  readonly gesture = signal(false);

  begin(label: UndoLabel): void {
    this.undoService.begin(label);
    this.gesture.set(true);
  }

  update(command: DocCommand): void {
    this.undoService.update(command);
  }

  commit(): void {
    this.undoService.commit();
    this.gesture.set(false);
  }

  cancel(): void {
    this.undoService.cancel();
    this.gesture.set(false);
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

  /** Refs to nodes and items that are gone after undo/redo leave the selection. */
  private pruneSelection(): void {
    const sel = this.selection();
    const kept = sel.filter((r) => this.doc.node(r) !== null);
    if (kept.length !== sel.length) this.selection.set(kept);
    const gs = groups(this.doc.iconJson);
    const items = this.items();
    const keptItems = items.filter(
      (i) =>
        i.kind === 'root' ||
        (i.group < gs.length && (i.kind === 'group' || i.layer < layers(gs[i.group]).length)),
    );
    if (keptItems.length !== items.length) this.items.set(keptItems);
  }
}
