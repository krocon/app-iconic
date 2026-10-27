import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ExportService } from './export.service';

/**
 * File › Export SVG… / Export PNG… (design 012 E14): without arguments the dialog with the
 * format chosen; with arguments (`{ appearances?, sizes?, mask?, effects?, targetDir?,
 * overwrite? }`, AI) straight to the files, the result as a status-line notice.
 */
export function registerExportActions(
  actions: ActionService,
  service: ExportService,
  destroyRef?: DestroyRef,
): void {
  const handler = (format: 'svg' | 'png') => ({
    run: (a?: unknown) => {
      if (a && typeof a === 'object')
        return service.runAction(format, a as Record<string, unknown>);
      service.openDialog(format);
      return undefined;
    },
    enabled: () => service.canExport(),
  });
  actions.registerAll(
    { 'file.exportSvg': handler('svg'), 'file.exportPng': handler('png') },
    destroyRef,
  );
}
