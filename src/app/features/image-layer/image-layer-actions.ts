import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ImageLayerService } from './image-layer.service';

/**
 * `file.importImageLayer` (PNG/JPEG/WebP/SVG → a new layer of the active group) and
 * `file.replaceLayerImage` (new PNG for the selected layer) – prompt 080. Both open the file
 * dialog, so they are no AI tools (`file.*` is denied, 018); the AI moves and scales layers with
 * `icon.set` (`position.scale|x|y`).
 */
export function registerImageLayerActions(
  actions: ActionService,
  images: ImageLayerService,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'file.importImageLayer': {
        run: () => images.importImageLayer(),
        enabled: () => images.canImport(),
      },
      'file.replaceLayerImage': {
        run: () => images.replaceLayerImage(),
        enabled: () => images.canReplace(),
      },
    },
    destroyRef,
  );
}
