/**
 * The AI history of a window (prompt 086 E9/E10), pure: what the last calls were, kept only in
 * memory. Contents (markup, commands, SVG) never appear – only what kind of call it was.
 */

/** Calls kept per window. */
export const HISTORY_MAX = 50;

export interface McpHistoryEntry {
  /** Running number in this window. */
  seq: number;
  /** When the call started (ms since the epoch). */
  at: number;
  /** The tool as the window runs it (`run_action`, `insert_svg`, `get_tree` …). */
  tool: string;
  /** Short description: action id, command type, format … (may be `''`). */
  detail: string;
  ok: boolean;
  /** Error code of a failed call. */
  code: string | null;
  /** How long it took (ms). */
  ms: number;
  /** The undo step the call made (its id, `UndoState.topId`), `null` = none. */
  undoId: number | null;
}

const str = (v: unknown, max = 80): string => {
  const s = typeof v === 'string' ? v : '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

/** The short description of a call – never its content. */
export function describeCall(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'run_action':
      return str(args['action']);
    case 'run_command': {
      const c = args['command'];
      return c && typeof c === 'object' && !Array.isArray(c)
        ? str((c as Record<string, unknown>)['type'])
        : '';
    }
    case 'insert_svg': {
      const n = typeof args['markup'] === 'string' ? (args['markup'] as string).length : 0;
      return `${n} chars`;
    }
    case 'select':
      return Array.isArray(args['nodes']) ? `${args['nodes'].length} nodes` : '';
    case 'get_node': {
      const node = args['node'] as Record<string, unknown> | undefined;
      return node && typeof node === 'object'
        ? `${str(node['asset'], 40)} #${str(node['id'], 40)}`
        : '';
    }
    case 'get_asset_svg':
      return str(args['asset']);
    case 'find_symbols':
      return str(args['query']);
    case 'export_package':
      return str(args['format']);
    case 'preview_svg':
      return str(args['appearance']) || 'light';
    case 'open':
    case 'save_document':
      // the file is the user's own and opaque (never split)
      return str(args['path'], 120);
    case 'export_png':
    case 'export_svg':
      return str(args['dir'], 120);
    default:
      return '';
  }
}

/** The list with `e` in front, at most `max` entries (newest first). */
export function pushEntry(
  list: readonly McpHistoryEntry[],
  e: McpHistoryEntry,
  max = HISTORY_MAX,
): McpHistoryEntry[] {
  return [e, ...list].slice(0, Math.max(1, max));
}

/**
 * The undo step of `e` is still the last one (`topId` of the same document now): its “Undo”
 * takes back exactly this call and nothing the user did after it.
 */
export function canUndo(e: McpHistoryEntry, topId: number | null): boolean {
  return e.ok && e.undoId !== null && topId !== null && e.undoId === topId;
}

/** `HH:MM:SS` in local time. */
export function clock(at: number): string {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}
