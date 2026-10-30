import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { DropApi } from '../../core/drop/drop-api';
import { DroppedFile, FileDropEvent } from '../../core/drop/drop.models';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { IconFileApi } from '../../core/icon-file/icon-file-api';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { AddService } from '../commands/add.service';
import { COMMANDS_TEXTS as CT } from '../commands/commands-texts';
import { DropHintKind, dropHintKind, DropStep, planDrop } from './file-drop';
import { FILES_TEXTS as T } from './files-texts';
import { FilesService } from './files.service';

export interface DropHover {
  /** Client coordinates of the pointer. */
  x: number;
  y: number;
  kind: DropHintKind;
}

/**
 * Files dragged from Finder/Explorer onto the window (design 071): shows where they land while
 * dragging (`hover`), then runs the steps of `planDrop` one after the other – every file is its
 * own undo step. Root service (one window, one document).
 */
@Injectable({ providedIn: 'root' })
export class FileDropService {
  private readonly api = inject(DropApi);
  private readonly fileApi = inject(IconFileApi);
  private readonly files = inject(FilesService);
  private readonly add = inject(AddService);
  private readonly canvas = inject(CanvasViewStore);
  /** The drag over the window now; `null` = none. */
  readonly hover = signal<DropHover | null>(null);
  private dragged: DroppedFile[] = [];

  start(destroyRef?: DestroyRef): void {
    void this.api
      .onFileDrop((e) => this.handle(e))
      .then((stop) => {
        if (destroyRef) destroyRef.onDestroy(stop);
      })
      .catch(() => undefined);
  }

  /** The drop point in document coordinates; `null` if it is not over the canvas. */
  canvasPoint(x: number, y: number): Point | null {
    const host = this.canvas.host;
    const el = globalThis.document?.elementFromPoint?.(x, y) ?? null;
    if (!host || !el?.closest('app-canvas-view .viewport')) return null;
    return clientToDocument(host, { clientX: x, clientY: y });
  }

  handle(e: FileDropEvent): Promise<void> {
    switch (e.phase) {
      case 'enter':
        this.dragged = e.files;
        this.show(e.x, e.y);
        break;
      case 'over':
        this.show(e.x, e.y);
        break;
      case 'leave':
        this.dragged = [];
        this.hover.set(null);
        break;
      case 'drop':
        this.dragged = [];
        this.hover.set(null);
        return this.drop(e.files, this.canvasPoint(e.x, e.y));
    }
    return Promise.resolve();
  }

  private show(x: number, y: number): void {
    const kind = dropHintKind(this.dragged, this.canvasPoint(x, y) !== null);
    this.hover.set({ x, y, kind });
  }

  /** Runs the files of one drop in order (design 071 E2). */
  async drop(files: readonly DroppedFile[], at: Point | null): Promise<void> {
    const steps = planDrop(files, at);
    let other = 0;
    for (const step of steps) {
      if (step.kind === 'other') other++;
      else await this.run(step);
    }
    if (other) this.files.notice.set(T.dropUnsupported(other));
  }

  private async run(step: Exclude<DropStep, { kind: 'other' }>): Promise<void> {
    switch (step.kind) {
      case 'open':
        return this.files.openRecent(step.path);
      case 'importSvg':
        return this.files.importSvgFile(step.path);
      case 'insertSvg':
        try {
          const file = await this.fileApi.readSvgFile(step.path);
          const err = await this.add.addSnippet(file.text, {
            centerX: step.at.x,
            centerY: step.at.y,
          });
          if (err) this.add.report(err);
        } catch (e) {
          this.files.notice.set(`${T.importFailed} ${describeFsError(toFsError(e))}`);
        }
        return;
      case 'image':
        try {
          const file = await this.fileApi.readImageFile(step.path);
          await this.add.addImageFile(
            file,
            step.at ? { centerX: step.at.x, centerY: step.at.y } : undefined,
          );
        } catch (e) {
          this.files.notice.set(`${CT.imageFailed} ${describeFsError(toFsError(e))}`);
        }
        return;
    }
  }
}
