import { IconGroup, IconLayer } from '../../../core/icon-file/icon-file.models';
import { NodeRef } from '../icon-document';
import { DropPosition, TreeTarget } from '../model/selection';
import { UndoLabel } from '../undo/undo-texts';

/** A value that survives `JSON.stringify` / `JSON.parse` unchanged. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Every document command as plain JSON (design 005 E15, AI rule of 26.10.2026): `type` plus the
 * arguments – node refs instead of DOM references, markup as text, no functions. `label` only
 * where a caller may name the action (property editors: "Change Fill"). `commandFromJson`
 * (`registry.ts`) turns it back into a command; the MCP server of prompt 018 sends exactly this.
 */
export type CommandJson =
  | { type: 'setAttribute'; ref: NodeRef; name: string; value: string; label?: UndoLabel }
  | { type: 'removeAttribute'; ref: NodeRef; name: string }
  | { type: 'insertNode'; parent: NodeRef; markup: string; index?: number; label?: UndoLabel }
  | { type: 'removeNode'; ref: NodeRef }
  | { type: 'moveNode'; ref: NodeRef; parent: NodeRef; index: number; label?: UndoLabel }
  | { type: 'replaceAssetMarkup'; asset: string; markup: string }
  /** Without `value` the key is removed. */
  | {
      type: 'setIconJsonValue';
      path: (string | number)[];
      value?: JsonValue;
      label?: UndoLabel;
    }
  | { type: 'addGroup'; group: IconGroup; index?: number }
  | { type: 'removeGroup'; index: number }
  | { type: 'moveGroup'; from: number; to: number }
  | { type: 'addLayer'; group: number; layer: IconLayer; index?: number }
  | { type: 'removeLayer'; group: number; index: number }
  | {
      type: 'moveLayer';
      from: { group: number; layer: number };
      to: { group: number; layer: number };
    }
  /** "Reorder Node" (design 006 E6): relative to a target, not by index. */
  | { type: 'reorder'; sources: TreeTarget[]; target: TreeTarget; position: DropPosition }
  | { type: 'groupNodes'; refs: NodeRef[] }
  | { type: 'ungroup'; ref: NodeRef }
  | { type: 'addAsset'; name: string; markup: string }
  | { type: 'removeAsset'; name: string }
  | { type: 'composite'; label: UndoLabel; commands: CommandJson[] };

export type CommandType = CommandJson['type'];

/** `{ …, key: value }` only when `value` is not `undefined` (keeps the JSON minimal). */
export function opt<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
