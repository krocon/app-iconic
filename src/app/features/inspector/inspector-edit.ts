import { IconJson } from '../../core/icon-file/icon-file.models';
import { CompositeCommand, DocCommand, RenameAsset, SetIconJsonValue } from '../document/commands';
import { IconDocument } from '../document/icon-document';
import { getIn, groups, JsonPath, layers } from '../document/model/icon-json';
import { IconItem } from '../document/model/selection';
import {
  AppearanceKey,
  hasVariant,
  JsonEdit,
  removeVariantEdits,
  resolveSpecialized,
  specKey,
  specializedSubEdits,
} from '../document/model/specializations';
import { uniqueAssetName, uniqueLayerName } from '../document/model/unique-names';
import { UndoLabel } from '../document/undo/undo-texts';
import { isValidFill } from './fill-model';
import { FieldDef, validFieldValue } from './icon-fields';
import { circlesWith, squaresValue, SquaresChoice } from './platforms';

/**
 * From inspector edits to document commands (design 010 E3, E5, E9): every change is a
 * `SetIconJsonValue` (several as one composite with one undo name). Pure apart from reading the
 * document.
 */

export function targetPath(t: IconItem): JsonPath {
  if (t.kind === 'root') return [];
  if (t.kind === 'group') return ['groups', t.group];
  return ['groups', t.group, 'layers', t.layer];
}

/** The object of a target, `undefined` if it does not exist. */
export function targetObject(json: IconJson, t: IconItem): Record<string, unknown> | undefined {
  if (t.kind === 'root') return json;
  const g = groups(json)[t.group];
  const o = t.kind === 'group' ? g : layers(g)[t.layer];
  return typeof o === 'object' && o !== null && !Array.isArray(o) ? o : undefined;
}

export interface FieldState {
  value: unknown;
  /** Set for this appearance / the base / nothing (built-in default). */
  source: 'variant' | 'base' | 'default';
  otherVariants: boolean;
  /** An entry of exactly this appearance exists (can be removed). */
  variant: boolean;
}

export function fieldState(
  json: IconJson,
  t: IconItem,
  def: FieldDef,
  appearance: AppearanceKey,
): FieldState {
  const obj = targetObject(json, t);
  const r = resolveSpecialized(obj, def.key, appearance, def.fallback);
  let value = r.value;
  if (def.sub.length) {
    const part = getIn(value, def.sub);
    value = part === undefined ? getIn(def.fallback, def.sub) : part;
  }
  return {
    value,
    source: r.source,
    otherVariants: r.otherVariants,
    variant: hasVariant(obj, def.key, appearance),
  };
}

/** The edits that set `def` to `value` for `appearance`; `null` if the value or target is wrong. */
export function fieldEdits(
  json: IconJson,
  t: IconItem,
  def: FieldDef,
  appearance: AppearanceKey,
  value: unknown,
): JsonEdit[] | null {
  const obj = targetObject(json, t);
  if (!obj || def.target !== t.kind) return null;
  if (def.kind === 'fill' ? !isValidFill(value) : !validFieldValue(def, value)) return null;
  return specializedSubEdits(obj, targetPath(t), def.key, appearance, def.sub, value, def.fallback);
}

/** The edits that remove the variant of `appearance` (the default applies again). */
export function variantRemoval(
  json: IconJson,
  t: IconItem,
  def: FieldDef,
  appearance: AppearanceKey,
): JsonEdit[] {
  const obj = targetObject(json, t);
  return obj ? removeVariantEdits(obj, targetPath(t), def.key, appearance) : [];
}

/** One command for the edits: a `SetIconJsonValue`, or a composite of them; `null` = nothing. */
export function editsCommand(edits: readonly JsonEdit[], label: UndoLabel): DocCommand | null {
  if (edits.length === 0) return null;
  const cmds = edits.map((e) => new SetIconJsonValue(e.path, e.value, label));
  return cmds.length === 1 ? cmds[0] : new CompositeCommand(label, cmds);
}

/** "Rename Layer": unique among all layers (design 010 E9); `null` if nothing changes. */
export function renameLayerCommand(
  json: IconJson,
  group: number,
  layer: number,
  name: string,
): DocCommand | null {
  const obj = targetObject(json, { kind: 'layer', group, layer });
  if (!obj || !name.trim()) return null;
  const others = groups(json).flatMap((g, gi) =>
    layers(g).flatMap((l, li) =>
      (gi !== group || li !== layer) && typeof l.name === 'string' ? [l.name] : [],
    ),
  );
  const unique = uniqueLayerName(name, others);
  if (unique === obj['name']) return null;
  return new SetIconJsonValue(
    [...targetPath({ kind: 'layer', group, layer }), 'name'],
    unique,
    'renameLayer',
  );
}

/** "Rename Group": the name is optional – empty removes it. */
export function renameGroupCommand(json: IconJson, group: number, name: string): DocCommand | null {
  const obj = targetObject(json, { kind: 'group', group });
  if (!obj) return null;
  const value = name.trim() || undefined;
  if (value === obj['name']) return null;
  return new SetIconJsonValue(['groups', group, 'name'], value, 'renameGroup');
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot) : '';
}

/** Every place in `icon.json` that names the asset `name` (`image-name` and its variants). */
export function assetReferences(json: IconJson, name: string): JsonPath[] {
  const key = name.normalize('NFC');
  const is = (v: unknown) => typeof v === 'string' && v.normalize('NFC') === key;
  const out: JsonPath[] = [];
  groups(json).forEach((g, gi) =>
    layers(g).forEach((l, li) => {
      const base: JsonPath = ['groups', gi, 'layers', li];
      if (is(l['image-name'])) out.push([...base, 'image-name']);
      const specs = l[specKey('image-name')];
      if (Array.isArray(specs)) {
        specs.forEach((e, i) => {
          if (typeof e === 'object' && e !== null && is((e as { value?: unknown }).value)) {
            out.push([...base, specKey('image-name'), i, 'value']);
          }
        });
      }
    }),
  );
  return out;
}

/**
 * "Rename Asset" (design 010 E9): the file and every reference, one step. The name is made unique
 * and keeps the extension when none was typed. `null` if nothing changes or `from` is missing.
 */
export function renameAssetCommand(doc: IconDocument, from: string, to: string): DocCommand | null {
  if (!doc.assets.has(from) || !to.trim()) return null;
  const typed = to.trim();
  const withExt = extension(typed) ? typed : typed + extension(from);
  const others = [...doc.assets.keys()].filter((n) => n !== from);
  const unique = uniqueAssetName(withExt, others);
  if (unique === from) return null;
  const refs = assetReferences(doc.iconJson, from).map(
    (p) => new SetIconJsonValue(p, unique, 'renameAsset'),
  );
  return new CompositeCommand('renameAsset', [new RenameAsset(from, unique), ...refs]);
}

/** "Change Platforms" (design 010 E10). */
export function platformsCommand(
  json: IconJson,
  change: { squares?: Exclude<SquaresChoice, 'other'>; watchOS?: boolean },
): DocCommand | null {
  const sp = json['supported-platforms'];
  const obj = typeof sp === 'object' && sp !== null && !Array.isArray(sp) ? sp : {};
  const edits: JsonEdit[] = [];
  if (change.squares !== undefined) {
    edits.push({ path: ['supported-platforms', 'squares'], value: squaresValue(change.squares) });
  }
  if (change.watchOS !== undefined) {
    const next = circlesWith(obj['circles'], change.watchOS);
    if (next !== obj['circles'])
      edits.push({ path: ['supported-platforms', 'circles'], value: next });
  }
  return editsCommand(edits, 'changePlatforms');
}

/** "Change Color Space" of untagged SVG colours; `null` = remove the key. */
export function colorSpaceCommand(json: IconJson, space: string | null): DocCommand | null {
  const key = 'color-space-for-untagged-svg-colors';
  if ((json[key] ?? null) === space) return null;
  return new SetIconJsonValue([key], space ?? undefined, 'changeColorSpace');
}
