import { DestroyRef } from '@angular/core';
import { ActionHandler, ActionService } from '../../core/actions/action.service';
import { isTextField } from '../../core/actions/keyboard-dispatcher';
import { DialogService } from '../../shared/dialog/dialog.service';
import { ALIGN_MODES } from '../../shared/geometry/align';
import { NodeRef } from '../document/icon-document';
import { IconItem } from '../document/model/selection';
import { EditService } from './edit.service';
import { Selection } from './follow-up';

/**
 * The edit and arrange actions of the selection (design 006 E15, E16): Cut / Copy / Paste / Copy
 * XML / Duplicate / Delete / Show-Hide / Select All / Deselect / Select, Bring to Front / Send to
 * Back / Move Up / Down / Into / Out / Group / Ungroup / Align. Registered by the window (they work
 * with the hierarchy panel hidden, too). `edit.editSvg` and `path.optimize`: `svg-source-actions.ts` (011).
 */

const MAX_SELECT = 10_000;

function isRef(v: unknown): v is NodeRef {
  const o = v as Record<string, unknown> | null;
  return (
    typeof o === 'object' &&
    o !== null &&
    typeof o['asset'] === 'string' &&
    typeof o['id'] === 'string' &&
    /^n\d+$/.test(o['id']) &&
    Object.keys(o).length === 2
  );
}

const index = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function isItem(v: unknown): v is IconItem {
  const o = v as Record<string, unknown> | null;
  if (typeof o !== 'object' || o === null) return false;
  const n = Object.keys(o).length;
  if (o['kind'] === 'root') return n === 1;
  if (o['kind'] === 'group') return n === 2 && index(o['group']);
  return o['kind'] === 'layer' && n === 3 && index(o['group']) && index(o['layer']);
}

/** `edit.select` arguments from outside (the AI): checked strictly. */
export function parseSelection(args: unknown): Selection | null {
  const o = (args ?? {}) as { nodes?: unknown; items?: unknown };
  const nodes = o.nodes ?? [];
  const items = o.items ?? [];
  if (!Array.isArray(nodes) || !Array.isArray(items)) return null;
  if (nodes.length > MAX_SELECT || items.length > MAX_SELECT) return null;
  if (!nodes.every(isRef) || !items.every(isItem)) return null;
  if (nodes.length && items.length) return null;
  return { nodes: nodes.map((r) => ({ asset: r.asset, id: r.id })), items };
}

export function registerEditActions(
  actions: ActionService,
  edit: EditService,
  dialogs: DialogService,
  destroyRef?: DestroyRef,
): void {
  const has = () => edit.hasSelection();
  const nodes = () => edit.selection().nodes.length > 0;
  const align = Object.fromEntries(
    ALIGN_MODES.map((m): [string, ActionHandler] => [
      `arrange.align.${m}`,
      { run: () => edit.align(m), enabled: () => edit.canAlign() },
    ]),
  );
  actions.registerAll(
    {
      'edit.copy': { run: () => void edit.copy(), enabled: () => edit.canCopy() },
      'edit.copyXml': { run: () => void edit.copyXml(), enabled: () => edit.canCopy() },
      'edit.cut': { run: () => void edit.cut(), enabled: () => edit.canDelete() },
      'edit.paste': {
        run: (a) => void edit.paste((a as { text?: string } | undefined)?.text),
        enabled: () => edit.store() !== null,
      },
      'edit.duplicate': { run: () => edit.duplicate(), enabled: has },
      'edit.delete': {
        run: (a) => void edit.delete((a as { confirm?: boolean } | undefined)?.confirm ?? false),
        enabled: () => edit.canDelete(),
      },
      'edit.toggleVisibility': {
        run: (a) =>
          edit.toggleVisibility(
            edit.selection(),
            (a as { recursive?: boolean } | undefined)?.recursive ?? false,
          ),
        enabled: () => edit.canToggleVisibility(),
      },
      'edit.selectAll': { run: () => edit.selectAll(), enabled: () => edit.store() !== null },
      'edit.deselect': { run: () => edit.store()?.clearSelection(), enabled: has },
      'edit.select': {
        run: (a) => {
          const sel = parseSelection(a);
          if (sel) edit.select(sel);
        },
        enabled: () => edit.store() !== null,
      },
      'arrange.bringToFront': { run: () => edit.front(), enabled: () => edit.canStack('front') },
      'arrange.sendToBack': { run: () => edit.back(), enabled: () => edit.canStack('back') },
      'arrange.moveUp': { run: () => edit.move('up'), enabled: () => !!edit.moveCommand('up') },
      'arrange.moveDown': {
        run: () => edit.move('down'),
        enabled: () => !!edit.moveCommand('down'),
      },
      'arrange.moveInto': {
        run: () => edit.move('into'),
        enabled: () => !!edit.moveCommand('into'),
      },
      'arrange.moveOut': { run: () => edit.move('out'), enabled: () => !!edit.moveCommand('out') },
      'arrange.group': { run: () => edit.group(), enabled: () => nodes() && edit.canGroup() },
      'arrange.ungroup': { run: () => edit.ungroup(), enabled: () => edit.canUngroup() },
      ...align,
    },
    destroyRef,
  );
  installClipboardEvents(edit, dialogs, destroyRef);
}

/**
 * The DOM events `copy` / `cut` / `paste` outside text fields (design 005 E7, 006 E12): the
 * predefined Cut/Copy/Paste items of the macOS menu arrive this way, with `clipboardData` and
 * without a permission prompt.
 */
function installClipboardEvents(
  edit: EditService,
  dialogs: DialogService,
  destroyRef?: DestroyRef,
) {
  const doc = globalThis.document;
  if (!doc) return;
  const ours = (e: ClipboardEvent) =>
    dialogs.open() === null && !isTextField(e.target instanceof Element ? e.target : null);
  const copy = (e: ClipboardEvent) => {
    const text = ours(e) ? edit.copyText() : null;
    if (text === null || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
    if (e.type === 'cut') void edit.delete(false, 'cut');
  };
  const paste = (e: ClipboardEvent) => {
    if (!ours(e) || !e.clipboardData) return;
    e.preventDefault();
    void edit.paste(e.clipboardData.getData('text/plain'));
  };
  doc.addEventListener('copy', copy);
  doc.addEventListener('cut', copy);
  doc.addEventListener('paste', paste);
  destroyRef?.onDestroy(() => {
    doc.removeEventListener('copy', copy);
    doc.removeEventListener('cut', copy);
    doc.removeEventListener('paste', paste);
  });
}
