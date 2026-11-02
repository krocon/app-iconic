/**
 * Which actions the AI may run (design 018 E12). Files and exports go through the tools with
 * their path checks and the user's permission; quitting, dialogs of the window, the system
 * clipboard, keyboard-only actions and AI control itself are not for the AI. Pure.
 */

// shortcuts belong to the user (prompt 085), like AI control itself
const DENIED_PREFIXES = ['file.', 'hierarchy.', 'mcp.', 'keymap.'];

const DENIED = new Set([
  'app.quit',
  'app.focusMenu',
  'app.palette',
  'settings.reset',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.copyXml',
  'icon.copyJson',
  'canvas.panHold',
  'sketch.moveHold',
  // In Context (prompt 081): clipboard and file dialogs
  'mockups.copyPng',
  'mockups.savePng',
  'mockups.background',
  // own symbols (prompt 084): saving and renaming are fine; deleting cannot be undone and the
  // folders are file dialogs
  'symbols.delete',
  'symbols.import',
  'symbols.export',
  // prompt 087: file dialogs and the system clipboard – the AI uses set_template with a path
  'template.fromFile',
  'template.fromClipboard',
  'trace.clipboard',
]);

/** Sources of `trace.image` the AI may use (no file dialog, no clipboard – prompt 087 E15). */
const AI_TRACE_SOURCES = ['template', 'layer'];

/**
 * `null` = allowed, else why not (for the AI's error message). `listing`: only whether the action
 * shows in `list_actions` (its arguments come later).
 */
export function deniedReason(id: string, args?: unknown, listing = false): string | null {
  if (DENIED.has(id) || DENIED_PREFIXES.some((p) => id.startsWith(p))) {
    if (id.startsWith('template.from') || id === 'trace.clipboard') {
      return 'use set_template with the image path, then trace.image {source: "template"}';
    }
    if (id.startsWith('file.save') || id === 'file.saveAs') return 'use save_document';
    if (id.startsWith('file.export')) return 'use export_png / export_svg / export_package';
    if (id === 'file.new' || id === 'file.newWindow') return 'use new_document';
    if (id === 'file.open' || id.startsWith('file.recent')) return 'use open_document';
    if (id.startsWith('edit.') || id === 'icon.copyJson' || id === 'mockups.copyPng')
      return 'the system clipboard is not for the AI';
    return 'not available to the AI';
  }
  if (id === 'trace.image' && !listing) {
    // without arguments it opens the dialog
    const source = (args as { source?: unknown } | undefined)?.source;
    if (args === undefined) return 'give arguments, e.g. {source: "template", preset: "shapes"}';
    if (source !== undefined && !AI_TRACE_SOURCES.includes(source as string)) {
      return 'source: "template" (set_template) or "layer" (a selected PNG layer)';
    }
  }
  if (id === 'settings.set') {
    const key = (args as { key?: unknown } | undefined)?.key;
    if (typeof key === 'string' && (key === 'mcp' || key.startsWith('mcp.'))) {
      return 'AI control can only be changed by the user';
    }
  }
  return null;
}
