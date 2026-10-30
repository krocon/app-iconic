/**
 * Which actions the AI may run (design 018 E12). Files and exports go through the tools with
 * their path checks and the user's permission; quitting, dialogs of the window, the system
 * clipboard, keyboard-only actions and AI control itself are not for the AI. Pure.
 */

const DENIED_PREFIXES = ['file.', 'hierarchy.', 'mcp.'];

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
]);

/** `null` = allowed, else why not (for the AI's error message). */
export function deniedReason(id: string, args?: unknown): string | null {
  if (DENIED.has(id) || DENIED_PREFIXES.some((p) => id.startsWith(p))) {
    if (id.startsWith('file.save') || id === 'file.saveAs') return 'use save_document';
    if (id.startsWith('file.export')) return 'use export_png / export_svg / export_package';
    if (id === 'file.new' || id === 'file.newWindow') return 'use new_document';
    if (id === 'file.open' || id.startsWith('file.recent')) return 'use open_document';
    if (id.startsWith('edit.') || id === 'icon.copyJson' || id === 'mockups.copyPng')
      return 'the system clipboard is not for the AI';
    return 'not available to the AI';
  }
  if (id === 'settings.set') {
    const key = (args as { key?: unknown } | undefined)?.key;
    if (typeof key === 'string' && (key === 'mcp' || key.startsWith('mcp.'))) {
      return 'AI control can only be changed by the user';
    }
  }
  return null;
}
