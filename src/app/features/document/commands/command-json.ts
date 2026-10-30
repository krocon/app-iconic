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
  /** Several attributes as one step – the result of a canvas gesture (design 007 E10). */
  | {
      type: 'setAttributes';
      /** `value: null` removes the attribute (design 009 E3). */
      changes: { ref: NodeRef; name: string; value: string | null }[];
      label?: UndoLabel;
    }
  /** Text content of elements without element children (design 009 E3). */
  | { type: 'setText'; changes: { ref: NodeRef; text: string }[] }
  | { type: 'removeAttribute'; ref: NodeRef; name: string }
  | { type: 'insertNode'; parent: NodeRef; markup: string; index?: number; label?: UndoLabel }
  | { type: 'removeNode'; ref: NodeRef }
  | { type: 'moveNode'; ref: NodeRef; parent: NodeRef; index: number; label?: UndoLabel }
  | { type: 'replaceAssetMarkup'; asset: string; markup: string }
  /** One node replaced by new markup ("Edit SVG…", design 011 E5). */
  | { type: 'replaceNode'; ref: NodeRef; markup: string }
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
  /** Asset file renamed in place (design 010 E9); references change separately. */
  | { type: 'renameAsset'; from: string; to: string }
  /** "Replace Color" in the SVG assets (prompt 074 E4); `assets` limits it. */
  | { type: 'replaceColor'; from: string; to: string; assets?: string[] }
  /** Clip paths (design 014 E5): a definition into the root `<defs>`, a node's / layer's clip, delete. */
  | { type: 'insertDefinition'; asset: string; markup: string; label?: UndoLabel }
  | { type: 'assignClip'; ref: NodeRef; mode: 'own' | 'none' | 'inherit'; clip?: string }
  | { type: 'setLayerClip'; asset: string; clip: string | null }
  | { type: 'removeClipPath'; ref: NodeRef }
  | { type: 'composite'; label: UndoLabel; commands: CommandJson[] };

export type CommandType = CommandJson['type'];

/** `{ …, key: value }` only when `value` is not `undefined` (keeps the JSON minimal). */
export function opt<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
