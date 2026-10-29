import { DestroyRef } from '@angular/core';
import { ActionHandler, ActionService } from '../../core/actions/action.service';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { pixelAlignCommand } from '../hierarchy/align';
import { PIXEL_GRIDS, PixelGrid, SmallPreviewService } from './small-preview.service';

/**
 * The actions of prompt 057: `view.smallPreview` (show the small sizes), `view.pixelGrid.<n>`
 * (off, 16, 32, 64, 128 – the grid and snapping), `arrange.alignToPixels` (the selection's boxes
 * onto the cells of the pixel grid, else of 32 px).
 */
export function registerPreviewActions(
  actions: ActionService,
  service: SmallPreviewService,
  files: FilesService,
  view: CanvasViewStore,
  destroyRef?: DestroyRef,
): void {
  const grid = (n: PixelGrid): ActionHandler => ({
    run: () => service.setPixelGrid(n),
    checked: () => service.pixelGrid() === n,
  });
  const handlers: Record<string, ActionHandler> = {
    'view.smallPreview': {
      run: () => service.visible.update((v) => !v),
      checked: () => service.visible(),
    },
    'view.pixelGrid.off': grid(0),
    'arrange.alignToPixels': {
      run: () => {
        const store = files.store();
        const cell = CANVAS_SIZE / (service.pixelGrid() || 32);
        const cmd = store
          ? pixelAlignCommand(store.document(), view.host, store.selection(), cell)
          : null;
        if (!store || !cmd) return false;
        store.execute(cmd);
        return true;
      },
      enabled: () => (files.store()?.selection().length ?? 0) > 0,
    },
  };
  for (const n of PIXEL_GRIDS) handlers[`view.pixelGrid.${n}`] = grid(n);
  actions.registerAll(handlers, destroyRef);
}
