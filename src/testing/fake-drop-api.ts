import { DropApi } from '../app/core/drop/drop-api';
import { FileDropEvent } from '../app/core/drop/drop.models';

/** Drag-drop events played by tests and the browser hook (design 071). */
export class FakeDropApi extends DropApi {
  private readonly listeners = new Set<(e: FileDropEvent) => void>();

  onFileDrop(fn: (e: FileDropEvent) => void): Promise<() => void> {
    this.listeners.add(fn);
    return Promise.resolve(() => this.listeners.delete(fn));
  }

  emit(e: FileDropEvent): void {
    for (const fn of this.listeners) fn(e);
  }
}
