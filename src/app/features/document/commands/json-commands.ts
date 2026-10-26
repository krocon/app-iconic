import { IconGroup, IconJson, IconLayer } from '../../../core/icon-file/icon-file.models';
import { IconDocument } from '../icon-document';
import { getIn, insertAt, JsonPath, moveAt, removeIn, setIn } from '../model/icon-json';
import { UndoLabel } from '../undo/undo-texts';
import { CommandError, DocCommand } from './command';
import { CommandJson, JsonValue, opt } from './command-json';

/**
 * Changes of `icon.json` (design 003 E1): the value is immutable, so a command keeps the root
 * before and after – undo and redo are exact, key order included.
 */
abstract class JsonCommand implements DocCommand {
  abstract readonly label: UndoLabel;
  abstract toJSON(): CommandJson;
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

/** Keys that would reach an object's prototype instead of a field. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Any value in `icon.json`; `undefined` removes the key (unknown fields stay untouched). */
export class SetIconJsonValue extends JsonCommand {
  constructor(
    readonly path: JsonPath,
    public value: unknown,
    readonly label: UndoLabel = 'changeIconProperty',
  ) {
    super();
    if (path.length === 0) throw new CommandError('empty path');
    if (path.some((k) => typeof k === 'string' && FORBIDDEN_KEYS.has(k))) {
      throw new CommandError('forbidden key in path');
    }
  }

  toJSON(): CommandJson {
    const label = this.label === 'changeIconProperty' ? undefined : this.label;
    return {
      type: 'setIconJsonValue',
      path: [...this.path],
      ...opt('value', this.value as JsonValue | undefined),
      ...opt('label', label),
    };
  }

  protected apply(json: IconJson): IconJson {
    return this.value === undefined
      ? removeIn(json, this.path)
      : setIn(json, this.path, this.value);
  }

  merge(next: DocCommand): boolean {
    if (
      !(next instanceof SetIconJsonValue) ||
      next.path.length !== this.path.length ||
      !next.path.every((k, i) => k === this.path[i]) ||
      !this.absorb(next)
    ) {
      return false;
    }
    // the serialised form describes the merged result (design 005 E15)
    this.value = next.value;
    return true;
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

  toJSON(): CommandJson {
    return { type: 'addGroup', group: this.group, ...opt('index', this.index) };
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

  toJSON(): CommandJson {
    return { type: 'removeGroup', index: this.index };
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

  toJSON(): CommandJson {
    return { type: 'moveGroup', from: this.from, to: this.to };
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

  toJSON(): CommandJson {
    return { type: 'addLayer', group: this.group, layer: this.layer, ...opt('index', this.index) };
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

  toJSON(): CommandJson {
    return { type: 'removeLayer', group: this.group, index: this.index };
  }
}
