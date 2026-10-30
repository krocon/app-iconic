import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ExportFormat } from './export-options';
import { ExportService } from './export.service';

/**
 * File › Export SVG… / Export PNG… / Xcode icon set, .icns, .ico (design 012 E14, 078): without arguments the dialog with the
 * format chosen; with arguments (`{ appearances?, sizes?, mask?, effects?, targetDir?,
 * overwrite? }`, AI) straight to the files, the result as a status-line notice.
 */
export function registerExportActions(
  actions: ActionService,
  service: ExportService,
  destroyRef?: DestroyRef,
): void {
  const handler = (format: ExportFormat) => ({
    run: (a?: unknown) => {
      if (a && typeof a === 'object')
        return service.runAction(format, a as Record<string, unknown>);
      service.openDialog(format);
      return undefined;
    },
    enabled: () => service.canExport(),
  });
  actions.registerAll(
    {
      'file.exportSvg': handler('svg'),
      'file.exportPng': handler('png'),
      // packages (prompt 078): Xcode icon set, .icns, .ico – same arguments plus `platforms`
      'file.exportAppIconSet': handler('appiconset'),
      'file.exportIcns': handler('icns'),
      'file.exportIco': handler('ico'),
      'file.exportAgain': {
        run: () => service.exportAgain(),
        enabled: () => service.canExportAgain(),
      },
      // ⇧⌘C: the icon as PNG into the clipboard (`{ size?, appearance? }`)
      'file.copyPng': {
        run: (a?: unknown) =>
          service.copyPng(a && typeof a === 'object' ? (a as Record<string, unknown>) : {}),
        enabled: () => service.canExport(),
      },
      // "Show in Folder" for the last export (design 030 E6)
      'file.revealExport': {
        run: () => service.reveal(),
        enabled: () => service.lastExport() !== null,
      },
    },
    destroyRef,
  );
}
