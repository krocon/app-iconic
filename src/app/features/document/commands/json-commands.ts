import { IconGroup, IconJson, IconLayer } from '../../../core/icon-file/icon-file.models';
import { IconDocument } from '../icon-document';
import { getIn, insertAt, JsonPath, moveAt, removeIn, setIn } from '../model/icon-json';
import { UndoLabel } from '../undo/undo-texts';
import { CommandError, DocCommand } from './command';

/**
 * Changes of `icon.json` (design 003 E1): the value is immutable, so a command keeps the root
 * before and after – undo and redo are exact, key order included.
 */
abstract class JsonCommand implements DocCommand {
  abstract readonly label: UndoLabel;
  private before: IconJson | null = null;
  private after: IconJson | null = null;

  protected abstract apply(json: IconJson): IconJson;

  do(doc: IconDocument): void {
    if (this.after && doc.iconJson === this.before) {
      doc.iconJson = this.after;
      return;
    }
    this.before = doc.iconJson;
    this.after = this.apply(doc.iconJson);
    doc.iconJson = this.after;
  }

  undo(doc: IconDocument): void {
    if (this.before) doc.iconJson = this.before;
  }

  /** Same target: keep our `before`, take the later `after`. */
  protected absorb(next: JsonCommand): boolean {
    if (!next.after) return false;
    this.after = next.after;
    return true;
  }
}

/** Any value in `icon.json`; `undefined` removes the key (unknown fields stay untouched). */
export class SetIconJsonValue extends JsonCommand {
  constructor(
    readonly path: JsonPath,
    readonly value: unknown,
    readonly label: UndoLabel = 'changeIconProperty',
  ) {
    super();
    if (path.length === 0) throw new CommandError('empty path');
  }

  protected apply(json: IconJson): IconJson {
    return this.value === undefined
      ? removeIn(json, this.path)
      : setIn(json, this.path, this.value);
  }

  merge(next: DocCommand): boolean {
    return (
      next instanceof SetIconJsonValue &&
      next.path.length === this.path.length &&
      next.path.every((k, i) => k === this.path[i]) &&
      this.absorb(next)
    );
  }
}

function groupCount(json: IconJson): number {
  return Array.isArray(json.groups) ? json.groups.length : 0;
}

function layerCount(json: IconJson, group: number): number {
  const l = getIn(json, ['groups', group, 'layers']);
  return Array.isArray(l) ? l.length : 0;
}

function check(ok: boolean, what: string): void {
  if (!ok) throw new CommandError(what);
}

/** A new group at `index` (default: the end). */
export class AddGroup extends JsonCommand {
  readonly label = 'addGroup';
  constructor(
    readonly group: IconGroup,
    readonly index?: number,
  ) {
    super();
  }

  protected apply(json: IconJson): IconJson {
    const at = this.index ?? groupCount(json);
    check(at >= 0 && at <= groupCount(json), `group index ${at}`);
    return insertAt(json, ['groups'], at, this.group);
  }
}

export class RemoveGroup extends JsonCommand {
  readonly label = 'removeGroup';
  constructor(readonly index: number) {
    super();
  }

  protected apply(json: IconJson): IconJson {
    check(this.index >= 0 && this.index < groupCount(json), `group ${this.index}`);
    return removeIn(json, ['groups', this.index]);
  }
}

/** Moves the group `from` to position `to` (index in the result). */
export class MoveGroup extends JsonCommand {
  readonly label = 'moveGroup';
  constructor(
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  protected apply(json: IconJson): IconJson {
    const n = groupCount(json);
    check(this.from >= 0 && this.from < n && this.to >= 0 && this.to < n, 'group move');
    return moveAt(json, ['groups'], this.from, this.to);
  }
}

/** A new layer in group `group` at `index` (default: the end). */
export class AddLayer extends JsonCommand {
  readonly label = 'addLayer';
  constructor(
    readonly group: number,
    readonly layer: IconLayer,
    readonly index?: number,
  ) {
    super();
  }

  protected apply(json: IconJson): IconJson {
    check(this.group >= 0 && this.group < groupCount(json), `group ${this.group}`);
    const at = this.index ?? layerCount(json, this.group);
    check(at >= 0 && at <= layerCount(json, this.group), `layer index ${at}`);
    return insertAt(json, ['groups', this.group, 'layers'], at, this.layer);
  }
}

export class RemoveLayer extends JsonCommand {
  readonly label = 'removeLayer';
  constructor(
    readonly group: number,
    readonly index: number,
  ) {
    super();
  }

  protected apply(json: IconJson): IconJson {
    check(this.index >= 0 && this.index < layerCount(json, this.group), `layer ${this.index}`);
    return removeIn(json, ['groups', this.group, 'layers', this.index]);
  }
}
