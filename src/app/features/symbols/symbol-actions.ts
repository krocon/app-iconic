import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { FilesService } from '../files/files.service';
import { SymbolLibraryService } from './symbol-library.service';

type Args = Record<string, unknown> | undefined;

/** `tags` of the AI: a list of strings (anything else = none). */
export function tagsArg(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string').slice(0, 16) : [];
}

/**
 * The actions of the own symbol library (prompt 084, design E15): `symbols.save { name?, tags? }`
 * (without `name` the dialog), `symbols.rename { id, name, tags? }`, `symbols.delete { id }`,
 * `symbols.import`, `symbols.export` (folder dialogs). An error becomes the window's notice.
 */
export function registerSymbolActions(
  actions: ActionService,
  library: SymbolLibraryService,
  files: FilesService,
  destroyRef?: DestroyRef,
): void {
  const report = (r: { ok: boolean; error?: string }) => {
    if (!r.ok && r.error) files.notice.set(r.error);
    return r.ok;
  };
  actions.registerAll(
    {
      'symbols.save': {
        run: async (a) => {
          const args = a as Args;
          if (typeof args?.['name'] !== 'string') {
            library.openSaveDialog();
            return undefined;
          }
          return report(await library.saveSelection(args['name'], tagsArg(args['tags'])));
        },
        enabled: () => library.canSave(),
      },
      'symbols.rename': {
        run: async (a) => {
          const args = a as Args;
          if (typeof args?.['id'] !== 'string' || typeof args['name'] !== 'string') return false;
          await library.refresh();
          const tags =
            args['tags'] === undefined
              ? [...(library.mine.info(args['id'])?.tags ?? [])]
              : tagsArg(args['tags']);
          return report(await library.rename(args['id'], args['name'], tags));
        },
      },
      'symbols.delete': {
        run: async (a) => {
          const args = a as Args;
          if (typeof args?.['id'] !== 'string') return false;
          return report(await library.remove(args['id']));
        },
      },
      'symbols.import': { run: () => library.importFolder() },
      'symbols.export': { run: () => library.exportFolder() },
    },
    destroyRef,
  );
}
