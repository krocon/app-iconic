import { IconGroup, IconLayer } from '../../../core/icon-file/icon-file.models';
import { NodeRef } from '../icon-document';
import { UNDO_TEXTS, UndoLabel } from '../undo/undo-texts';
import { AddAsset, RemoveAsset, ReplaceAssetMarkup } from './asset-commands';
import { CommandError, CompositeCommand, DocCommand } from './command';
import { CommandType } from './command-json';
import { DROP_POSITIONS, DropPosition, TreeTarget } from '../model/selection';
import {
  AddGroup,
  AddLayer,
  MoveGroup,
  MoveLayer,
  RemoveGroup,
  RemoveLayer,
  SetIconJsonValue,
} from './json-commands';
import { InsertNode, MoveNode, RemoveAttribute, RemoveNode, SetAttribute } from './node-commands';
import { GroupNodes, ReorderNode, Ungroup } from './tree-commands';

/**
 * The registry `type → parse` of every document command (design 005 E15, AI rule): JSON from
 * outside (the MCP server of prompt 018, `edit.runCommand`) is checked strictly here before a
 * command is made – foreign input is hostile. The commands themselves check their targets
 * against the document when they run.
 */

/** Longest markup accepted (same limit as an SVG file, `read_svg_file`). */
export const MAX_MARKUP = 16 << 20;
/** Longest JSON value for `setIconJsonValue` / groups / layers (serialised). */
export const MAX_JSON_VALUE = 1 << 20;
export const MAX_COMPOSITE_DEPTH = 8;
export const MAX_COMMANDS = 10_000;
const MAX_NAME = 255;
/** Most nodes one reorder / group command may name. */
export const MAX_REFS = 10_000;
const MAX_PATH = 32;

type Obj = Record<string, unknown>;

function fail(what: string): never {
  throw new CommandError(`invalid command: ${what}`);
}

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(what);
  return v as Obj;
}

/** Only the keys a command knows (a typo must not be ignored silently). */
function keys(o: Obj, allowed: readonly string[]): void {
  for (const k of Object.keys(o))
    if (k !== 'type' && !allowed.includes(k)) fail(`unknown key ${k}`);
}

function str(v: unknown, what: string, max = MAX_NAME): string {
  if (typeof v !== 'string' || v.length > max) fail(what);
  return v;
}

function name(v: unknown, what: string): string {
  const s = str(v, what);
  if (!s) fail(what);
  return s;
}

/** An attribute name the DOM accepts (`fill`, `xlink:href`, `stroke-width`). */
function attrName(v: unknown): string {
  const s = name(v, 'name');
  if (!/^[A-Za-z_][\w.-]*(:[A-Za-z_][\w.-]*)?$/.test(s)) fail('name');
  return s;
}

function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) fail(what);
  return v;
}

function optInt(v: unknown, what: string): number | undefined {
  return v === undefined ? undefined : int(v, what);
}

function ref(v: unknown, what: string): NodeRef {
  const o = obj(v, what);
  keys(o, ['asset', 'id']);
  const id = str(o['id'], what, 32);
  if (!/^n\d+$/.test(id)) fail(what);
  return { asset: name(o['asset'], what), id };
}

function label(v: unknown): UndoLabel | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v === 'undo' || v === 'redo' || !Object.hasOwn(UNDO_TEXTS, v)) {
    fail('label');
  }
  return v as UndoLabel;
}

/** A JSON value (as `JSON.parse` makes it), not too large. */
function jsonValue(v: unknown, what: string): unknown {
  let text: string | undefined;
  try {
    text = JSON.stringify(v);
  } catch {
    fail(what);
  }
  if (text === undefined || text.length > MAX_JSON_VALUE) fail(what);
  return JSON.parse(text) as unknown;
}

function path(v: unknown): (string | number)[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_PATH) fail('path');
  return v.map((k) => (typeof k === 'number' ? int(k, 'path') : str(k, 'path')));
}

/** `{ group, layer }` of a layer. */
function layerPos(v: unknown, what: string): { group: number; layer: number } {
  const o = obj(v, what);
  keys(o, ['group', 'layer']);
  return { group: int(o['group'], what), layer: int(o['layer'], what) };
}

function list<T>(v: unknown, what: string, item: (x: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_REFS) fail(what);
  return v.map(item);
}

/** A tree target (design 006 E6): group, layer or node. */
function treeTarget(v: unknown, what: string): TreeTarget {
  const o = obj(v, what);
  switch (o['kind']) {
    case 'group':
      keys(o, ['kind', 'group']);
      return { kind: 'group', group: int(o['group'], what) };
    case 'layer':
      keys(o, ['kind', 'group', 'layer']);
      return { kind: 'layer', group: int(o['group'], what), layer: int(o['layer'], what) };
    case 'node':
      keys(o, ['kind', 'ref']);
      return { kind: 'node', ref: ref(o['ref'], what) };
    default:
      fail(what);
  }
}

function position(v: unknown): DropPosition {
  if (typeof v !== 'string' || !DROP_POSITIONS.includes(v as DropPosition)) fail('position');
  return v as DropPosition;
}

type Parser = (o: Obj, depth: number, count: { n: number }) => DocCommand;

const PARSERS: Record<CommandType, Parser> = {
  setAttribute: (o) => {
    keys(o, ['ref', 'name', 'value', 'label']);
    return new SetAttribute(
      ref(o['ref'], 'ref'),
      attrName(o['name']),
      str(o['value'], 'value', MAX_MARKUP),
      label(o['label']),
    );
  },
  removeAttribute: (o) => {
    keys(o, ['ref', 'name']);
    return new RemoveAttribute(ref(o['ref'], 'ref'), attrName(o['name']));
  },
  insertNode: (o) => {
    keys(o, ['parent', 'markup', 'index', 'label']);
    return new InsertNode(
      ref(o['parent'], 'parent'),
      str(o['markup'], 'markup', MAX_MARKUP),
      optInt(o['index'], 'index'),
      label(o['label']),
    );
  },
  removeNode: (o) => {
    keys(o, ['ref']);
    return new RemoveNode(ref(o['ref'], 'ref'));
  },
  moveNode: (o) => {
    keys(o, ['ref', 'parent', 'index', 'label']);
    return new MoveNode(
      ref(o['ref'], 'ref'),
      ref(o['parent'], 'parent'),
      int(o['index'], 'index'),
      label(o['label']),
    );
  },
  replaceAssetMarkup: (o) => {
    keys(o, ['asset', 'markup']);
    return new ReplaceAssetMarkup(
      name(o['asset'], 'asset'),
      str(o['markup'], 'markup', MAX_MARKUP),
    );
  },
  setIconJsonValue: (o) => {
    keys(o, ['path', 'value', 'label']);
    const value = 'value' in o ? jsonValue(o['value'], 'value') : undefined;
    return new SetIconJsonValue(path(o['path']), value, label(o['label']));
  },
  addGroup: (o) => {
    keys(o, ['group', 'index']);
    const group = obj(jsonValue(o['group'], 'group'), 'group') as IconGroup;
    return new AddGroup(group, optInt(o['index'], 'index'));
  },
  removeGroup: (o) => {
    keys(o, ['index']);
    return new RemoveGroup(int(o['index'], 'index'));
  },
  moveGroup: (o) => {
    keys(o, ['from', 'to']);
    return new MoveGroup(int(o['from'], 'from'), int(o['to'], 'to'));
  },
  addLayer: (o) => {
    keys(o, ['group', 'layer', 'index']);
    const layer = obj(jsonValue(o['layer'], 'layer'), 'layer') as IconLayer;
    return new AddLayer(int(o['group'], 'group'), layer, optInt(o['index'], 'index'));
  },
  removeLayer: (o) => {
    keys(o, ['group', 'index']);
    return new RemoveLayer(int(o['group'], 'group'), int(o['index'], 'index'));
  },
  moveLayer: (o) => {
    keys(o, ['from', 'to']);
    return new MoveLayer(layerPos(o['from'], 'from'), layerPos(o['to'], 'to'));
  },
  reorder: (o) => {
    keys(o, ['sources', 'target', 'position']);
    return new ReorderNode(
      list(o['sources'], 'sources', (s) => treeTarget(s, 'sources')),
      treeTarget(o['target'], 'target'),
      position(o['position']),
    );
  },
  groupNodes: (o) => {
    keys(o, ['refs']);
    return new GroupNodes(list(o['refs'], 'refs', (r) => ref(r, 'refs')));
  },
  ungroup: (o) => {
    keys(o, ['ref']);
    return new Ungroup(ref(o['ref'], 'ref'));
  },
  addAsset: (o) => {
    keys(o, ['name', 'markup']);
    return new AddAsset(name(o['name'], 'name'), str(o['markup'], 'markup', MAX_MARKUP));
  },
  removeAsset: (o) => {
    keys(o, ['name']);
    return new RemoveAsset(name(o['name'], 'name'));
  },
  composite: (o, depth, count) => {
    keys(o, ['label', 'commands']);
    if (depth >= MAX_COMPOSITE_DEPTH) fail('nested too deeply');
    const list = o['commands'];
    if (!Array.isArray(list) || list.length === 0) fail('commands');
    const l = label(o['label']);
    if (!l) fail('label');
    return new CompositeCommand(
      l,
      list.map((c) => parse(c, depth + 1, count)),
    );
  },
};

/** Every command type the registry knows. */
export const COMMAND_TYPES = Object.keys(PARSERS) as CommandType[];

function parse(json: unknown, depth: number, count: { n: number }): DocCommand {
  if (++count.n > MAX_COMMANDS) fail('too many commands');
  const o = obj(json, 'not an object');
  const type = o['type'];
  if (typeof type !== 'string' || !Object.hasOwn(PARSERS, type)) {
    fail(`unknown type ${String(type)}`);
  }
  return PARSERS[type as CommandType](o, depth, count);
}

/**
 * A command from its JSON (`DocCommand.toJSON()`, design 005 E15). Throws `CommandError` for
 * anything that is not exactly a known command with valid arguments.
 */
export function commandFromJson(json: unknown): DocCommand {
  return parse(json, 0, { n: 0 });
}
