import { IconDocument } from '../icon-document';
import { UndoLabel } from '../undo/undo-texts';
import { CommandJson } from './command-json';

/**
 * A named, undoable change of the document (design 003 E6). `do` may run again after `undo`
 * (redo) and must then give the same result. Commands may keep their own detached elements so
 * that redo puts back the same nodes with the same ids.
 */
export interface DocCommand {
  readonly label: UndoLabel;
  do(doc: IconDocument): void;
  undo(doc: IconDocument): void;
  /**
   * Gestures (design 003 E6): `next` has just been done after this one; take it over (same
   * target) and return `true`, so that undo goes back to before this command in one step.
   */
  merge?(next: DocCommand): boolean;
  /** The command as plain JSON (design 005 E15); `commandFromJson` makes it again. After a
   * `merge` it describes the merged result, so a gesture is one serialisable command. */
  toJSON(): CommandJson;
}

/** Several commands as one undo step; if one fails, the done ones are undone. */
export class CompositeCommand implements DocCommand {
  constructor(
    readonly label: UndoLabel,
    readonly commands: readonly DocCommand[],
  ) {}

  do(doc: IconDocument): void {
    const done: DocCommand[] = [];
    try {
      for (const c of this.commands) {
        c.do(doc);
        done.push(c);
      }
    } catch (e) {
      for (const c of done.reverse()) c.undo(doc);
      throw e;
    }
  }

  undo(doc: IconDocument): void {
    for (const c of [...this.commands].reverse()) c.undo(doc);
  }

  toJSON(): CommandJson {
    return { type: 'composite', label: this.label, commands: this.commands.map((c) => c.toJSON()) };
  }
}

/**
 * A step the AI made over MCP (design 018 E10): the same command, shown as "AI: …" in Undo/Redo.
 * Serialises as the command itself (the AI's steps are ordinary commands).
 */
export class AiCommand implements DocCommand {
  readonly label: UndoLabel;

  constructor(readonly command: DocCommand) {
    this.label = command.label;
  }

  do(doc: IconDocument): void {
    this.command.do(doc);
  }

  undo(doc: IconDocument): void {
    this.command.undo(doc);
  }

  toJSON(): CommandJson {
    return this.command.toJSON();
  }
}

/** Thrown when a command's target does not exist (nothing was changed). */
export class CommandError extends Error {}
