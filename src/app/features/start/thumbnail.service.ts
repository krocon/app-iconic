import { inject, Injectable } from '@angular/core';
import { RecentFilesApi } from '../../core/recent/recent-files-api';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { exportSvg } from '../export/export-svg';
import { rasterSizes } from '../export/export.service';
import { FilesService } from '../files/files.service';

/**
 * Preview images of the recent files (design 082 E4/E5): after a file was opened or saved here,
 * the icon as the canvas shows it (Light, mask and effects of the view – like "Copy as PNG", 078
 * E7) goes to Rust, which renders a small PNG into its cache. Quiet: a preview never disturbs.
 */
@Injectable({ providedIn: 'root' })
export class ThumbnailService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly api = inject(RecentFilesApi);
  /** The running preview (tests wait for it). */
  pending: Promise<boolean> = Promise.resolve(false);

  constructor() {
    this.files.onRecorded((path) => {
      this.pending = this.record(path);
    });
  }

  /** Renders the window's document as the preview of `path`; `false` if it is another file. */
  async record(path: string): Promise<boolean> {
    const doc = this.files.store()?.document();
    if (!doc || doc.path !== path) return false;
    try {
      const v = this.view.options();
      const svg = exportSvg(
        doc,
        'light',
        { mask: v.mask, effects: v.effects, tint: v.tint },
        await rasterSizes(doc),
      );
      return await this.api.saveThumbnail(path, svg);
    } catch {
      return false;
    }
  }

  /**
   * Previews of the recent icons other than `exclude`, newest first (the neighbours in the mockup
   * scenes, design 082 E10); empty when there are none or the backend is missing.
   */
  async neighbours(exclude: string | null): Promise<string[]> {
    try {
      const entries = await this.api.entries();
      return entries.flatMap((e) => (e.thumbnail && e.path !== exclude ? [e.thumbnail] : []));
    } catch {
      return [];
    }
  }
}
