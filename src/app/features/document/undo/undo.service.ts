import { computed, signal } from '@angular/core';
import { CompositeCommand, DocCommand } from '../commands/command';
import { IconDocument } from '../icon-document';
import { logUndo } from './undo-log';
import { undoTitle, UndoLabel } from './undo-texts';

/** What menus and buttons show (design 003 E6). */
export interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
  /** "Undo Change Attribute" – or just "Undo". */
  undoLabel: string;
  redoLabel: string;
  /** Not at the save point. */
  dirty: boolean;
}

/** The state with the names as keys – translated when read (design 015 E17). */
interface RawState {
  canUndo: boolean;
  canRedo: boolean;
  undoName: UndoLabel | null;
  redoName: UndoLabel | null;
  dirty: boolean;
}

interface Entry {
  id: number;
  command: DocCommand;
}

/** Steps kept; older ones fall out (the document then stays dirty until saved). */
export const UNDO_DEPTH = 200;

/**
 * Undo/redo of one document (design 003 E6): named commands, composite commands, gestures
 * (`begin` → `update`* → `commit`/`cancel`) that become one step, and a save point for dirty.
 * Not injectable – each `DocumentStore` has its own.
 */
export class UndoService {
  private done: Entry[] = [];
  private undone: Entry[] = [];
  private seq = 0;
  /** Id of the top entry when saved (0 = the empty stack, -1 = no longer reachable). */
  private savePoint = 0;
  private gesture: { label: UndoLabel; commands: DocCommand[] } | null = null;
  private readonly _state = signal<RawState>(this.compute());
  /** Labels in the UI language: a language switch renames "Undo …" at once. */
  readonly state = computed<UndoState>(() => {
    const { undoName, redoName, ...rest } = this._state();
    return {
      ...rest,
      undoLabel: undoTitle('undo', undoName),
      redoLabel: undoTitle('redo', redoName),
    };
  });

  constructor(
    private readonly doc: IconDocument,
    private readonly changed: () => void = () => undefined,
    private readonly depth = UNDO_DEPTH,
  ) {}

  /** Runs `command` as a new step (inside a gesture: as part of it). Throws if it fails. */
  execute(command: DocCommand): void {
    if (this.gesture) {
      this.update(command);
      return;
    }
    command.do(this.doc);
    this.push(command);
    this.publish();
  }

  /**
   * Runs `command` and folds it into the top step when that step is `into` and takes it over
   * (`merge`) – a series of nudges is one step (design 007 E12) without an open gesture that could
   * swallow other commands. Never folds into the save point (dirty stays right). `true` = folded.
   */
  executeInto(command: DocCommand, into: DocCommand | null): boolean {
    if (this.gesture) {
      this.update(command);
      return false;
    }
    command.do(this.doc);
    const top = this.done.at(-1);
    if (into && top && top.command === into && top.id !== this.savePoint && into.merge?.(command)) {
      logUndo('merged into the top step', into.label);
      this.undone = [];
      this.publish();
      return true;
    }
    this.push(command);
    this.publish();
    return false;
  }

  /** Starts a gesture (drag, slider): the following updates become one step (prompt 007). */
  begin(label: UndoLabel): void {
    if (this.gesture) this.commit();
    logUndo('gesture begins', label);
    this.gesture = { label, commands: [] };
  }

  /** One change of the running gesture; merged into the previous one when it has the same target. */
  update(command: DocCommand): void {
    if (!this.gesture) {
      this.execute(command);
      return;
    }
    command.do(this.doc);
    const last = this.gesture.commands.at(-1);
    if (last?.merge?.(command)) logUndo('gesture merges', command.label);
    else this.gesture.commands.push(command);
    this.changed();
  }

  /** Ends the gesture as one step (nothing if it changed nothing). */
  commit(): void {
    const g = this.gesture;
    this.gesture = null;
    if (!g || g.commands.length === 0) return;
    logUndo('gesture commits', g.label, { commands: g.commands.length });
    const command =
      g.commands.length === 1 && g.commands[0].label === g.label
        ? g.commands[0]
        : new CompositeCommand(g.label, g.commands);
    this.push(command);
    this.publish();
  }

  /** Takes the gesture back (Escape). */
  cancel(): void {
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    for (const c of [...g.commands].reverse()) c.undo(this.doc);
    if (g.commands.length) this.changed();
  }

  /** The step `undo` would take back (after a gesture: the committed one). */
  get top(): DocCommand | null {
    return this.done.at(-1)?.command ?? null;
  }

  get inGesture(): boolean {
    return this.gesture !== null;
  }

  undo(): boolean {
    this.commit();
    const e = this.done.pop();
    if (!e) return false;
    e.command.undo(this.doc);
    this.undone.push(e);
    this.publish();
    return true;
  }

  redo(): boolean {
    this.commit();
    const e = this.undone.pop();
    if (!e) return false;
    e.command.do(this.doc);
    this.done.push(e);
    this.publish();
    return true;
  }

  /** The document was saved in its current state. */
  markSaved(): void {
    this.commit();
    this.savePoint = this.done.at(-1)?.id ?? 0;
    this.publish();
  }

  private push(command: DocCommand): void {
    this.done.push({ id: ++this.seq, command });
    this.undone = [];
    if (this.done.length > this.depth) {
      const dropped = this.done.splice(0, this.done.length - this.depth);
      // the state below the oldest step is no longer reachable – neither is a save point there
      if (this.savePoint <= dropped[dropped.length - 1].id) this.savePoint = -1;
    }
  }

  private compute(): RawState {
    const top = this.done?.at(-1);
    const next = this.undone?.at(-1);
    return {
      canUndo: !!top,
      canRedo: !!next,
      undoName: top?.command.label ?? null,
      redoName: next?.command.label ?? null,
      dirty: (top?.id ?? 0) !== (this.savePoint ?? 0),
    };
  }

  private publish(): void {
    this._state.set(this.compute());
    this.changed();
  }
}
