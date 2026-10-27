import { computed, inject, Injectable, signal } from '@angular/core';
import { ClipboardApi } from '../../core/clipboard/clipboard-api';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DocCommand } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { IconItem } from '../document/model/selection';
import { AppearanceKey } from '../document/model/specializations';
import { UndoLabel } from '../document/undo/undo-texts';
import { FilesService } from '../files/files.service';
import { formatIconJson } from './icon-json-text';
import { FieldDef, fieldDef, FieldTarget } from './icon-fields';
import {
  colorSpaceCommand,
  editsCommand,
  fieldEdits,
  platformsCommand,
  renameAssetCommand,
  renameGroupCommand,
  renameLayerCommand,
  targetObject,
  variantRemoval,
} from './inspector-edit';
import { SquaresChoice } from './platforms';

/** A target as the AI names it: nothing = the icon, `{ group }`, `{ group, layer }`. */
export interface TargetArgs {
  group?: number;
  layer?: number;
}

/**
 * The editing side of the icon inspector (design 010 E2, E5, E14): the appearance being edited,
 * typed values and sliders as one gesture per field, one-shot changes for selects, switches and
 * the AI actions `icon.*`. Root service: one window, one document (`FilesService.store`).
 */
@Injectable({ providedIn: 'root' })
export class IconInspectorService {
  private readonly files = inject(FilesService);
  private readonly canvas = inject(CanvasViewStore);
  private readonly clipboard = inject(ClipboardApi);
  private session: { store: DocumentStore; key: string } | null = null;
  /** Tinted is only edited, never previewed – the canvas keeps light/dark. */
  private readonly tinted = signal(false);

  /** Default / Dark follow the canvas preview, Tinted is the inspector's own (design 010 E2). */
  readonly appearance = computed<AppearanceKey>(() =>
    this.tinted() ? 'tinted' : this.canvas.options().appearance === 'dark' ? 'dark' : 'default',
  );

  get store(): DocumentStore | null {
    return this.files.store();
  }

  setAppearance(a: AppearanceKey): void {
    this.commit();
    this.tinted.set(a === 'tinted');
    if (a !== 'tinted') this.canvas.set('appearance', a === 'dark' ? 'dark' : 'light');
  }

  /** The one selected root / group / layer, `null` otherwise. */
  target(store: DocumentStore | null = this.store): IconItem | null {
    const items = store?.items() ?? [];
    return items.length === 1 ? items[0] : null;
  }

  /** `{ group?, layer? }` → an existing target, `null` if it does not exist. */
  resolveTarget(args: TargetArgs | undefined, store = this.store): IconItem | null {
    if (!store) return null;
    const json = store.document().iconJson;
    const t: IconItem =
      args?.layer !== undefined && args.group !== undefined
        ? { kind: 'layer', group: args.group, layer: args.layer }
        : args?.group !== undefined
          ? { kind: 'group', group: args.group }
          : { kind: 'root' };
    if (args?.layer !== undefined && args.group === undefined) return null;
    return targetObject(json, t) ? t : null;
  }

  /** A live value of a field (starts its gesture; another field's gesture is committed first). */
  edit(target: IconItem, def: FieldDef, value: unknown): boolean {
    const store = this.store;
    if (!store) return false;
    const key = `${JSON.stringify(target)}:${def.id}:${this.appearance()}`;
    if (this.session && (this.session.store !== store || this.session.key !== key)) this.commit();
    const edits = fieldEdits(store.document().iconJson, target, def, this.appearance(), value);
    const cmd = edits && editsCommand(edits, def.undo);
    if (!cmd) return false;
    if (!this.session) {
      store.begin(def.undo);
      this.session = { store, key };
    }
    store.update(cmd);
    return true;
  }

  commit(): void {
    this.session?.store.commit();
    this.session = null;
  }

  cancel(): void {
    this.session?.store.cancel();
    this.session = null;
  }

  private run(cmd: DocCommand | null): boolean {
    this.commit();
    const store = this.store;
    if (!store || !cmd) return false;
    try {
      store.execute(cmd);
      return true;
    } catch {
      return false;
    }
  }

  /** One step: field `id` of `target` = `value` for `appearance` (default: the edited one). */
  set(target: IconItem | null, id: string, value: unknown, appearance?: AppearanceKey): boolean {
    const store = this.store;
    const def = target ? fieldDef(target.kind as FieldTarget, id) : undefined;
    if (!store || !target || !def) return false;
    const edits = fieldEdits(
      store.document().iconJson,
      target,
      def,
      appearance ?? this.appearance(),
      value,
    );
    return this.run(edits && editsCommand(edits, def.undo));
  }

  /** The variant of `appearance` goes, the default applies again ("Remove Appearance Variant"). */
  removeVariant(target: IconItem | null, id: string, appearance?: AppearanceKey): boolean {
    const store = this.store;
    const def = target ? fieldDef(target.kind as FieldTarget, id) : undefined;
    if (!store || !target || !def) return false;
    const a = appearance ?? this.appearance();
    return this.run(
      editsCommand(variantRemoval(store.document().iconJson, target, def, a), 'removeVariant'),
    );
  }

  renameLayer(group: number, layer: number, name: string): boolean {
    const store = this.store;
    return !!store && this.run(renameLayerCommand(store.document().iconJson, group, layer, name));
  }

  renameGroup(group: number, name: string): boolean {
    const store = this.store;
    return !!store && this.run(renameGroupCommand(store.document().iconJson, group, name));
  }

  renameAsset(from: string, to: string): boolean {
    const store = this.store;
    return !!store && this.run(renameAssetCommand(store.document(), from, to));
  }

  setPlatforms(change: { squares?: Exclude<SquaresChoice, 'other'>; watchOS?: boolean }): boolean {
    const store = this.store;
    return !!store && this.run(platformsCommand(store.document().iconJson, change));
  }

  setColorSpace(space: string | null): boolean {
    const store = this.store;
    return !!store && this.run(colorSpaceCommand(store.document().iconJson, space));
  }

  /** The icon.json text as the preview shows it. */
  jsonText(): string {
    const store = this.store;
    return store ? formatIconJson(store.document().iconJson) : '';
  }

  async copyJson(): Promise<boolean> {
    const text = this.jsonText();
    if (!text) return false;
    try {
      await this.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  /** Undo name of a field (tests, AI). */
  labelOf(target: IconItem, id: string): UndoLabel | null {
    return fieldDef(target.kind as FieldTarget, id)?.undo ?? null;
  }
}
