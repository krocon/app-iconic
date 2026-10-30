import { ActionDef, APP, FILE, MAX_RECENT_ACTIONS } from './action-def';
import { EXPORT_ARGS } from '../export-action-args';

/** The actions of app, AI control, settings and file (split from `action-catalog.ts` in prompt 033). */
export const APP_FILE_ACTIONS: readonly ActionDef[] = [
  // app (macOS: About and Quit in the app menu)
  APP('app.palette', 'Command Palette…', { palette: false }),
  APP('app.about', 'About AppIconic'),
  APP('app.settings', 'Settings…'),
  // AI control (design 018 E16): closes every connection of AI assistants (MCP)
  APP('mcp.disconnect', 'Disconnect AI'),
  // settings (design 015 E11): `key` is a path of `SETTING_KEYS` (`canvas.rulers`, `theme` …)
  APP('settings.set', 'Change a Setting', {
    palette: false,
    args: {
      type: 'object',
      required: ['key', 'value'],
      properties: { key: { type: 'string', maxLength: 64 }, value: { type: 'json' } },
    },
  }),
  // `confirm: false` resets without asking (AI, tests)
  APP('settings.reset', 'Reset Settings to Default…', {
    args: { type: 'object', properties: { confirm: { type: 'boolean' } } },
  }),
  APP('app.quit', 'Quit AppIconic'),
  APP('app.focusMenu', 'Focus the menu bar', { palette: false }),
  // file (legacy §4)
  FILE('file.newWindow', 'New Window'),
  FILE('file.new', 'New Document'),
  FILE('file.open', 'Open…'),
  ...Array.from({ length: MAX_RECENT_ACTIONS }, (_, i) =>
    FILE(`file.recent.${i + 1}`, `Open Recent File ${i + 1}`),
  ),
  FILE('file.noRecent', 'No Recent Items', { palette: false }),
  FILE('file.clearRecent', 'Clear Recent Menu'),
  FILE('file.importSvg', 'Import SVG…'),
  // without arguments the export dialog; with them straight to the files (design 012 E14)
  FILE('file.exportSvg', 'Export SVG…', { args: EXPORT_ARGS }),
  FILE('file.exportPng', 'Export PNG…', { args: EXPORT_ARGS }),
  FILE('file.revealExport', 'Show Last Export in Folder'),
  FILE('file.save', 'Save'),
  FILE('file.saveAs', 'Save As…'),
  FILE('file.close', 'Close'),
];
