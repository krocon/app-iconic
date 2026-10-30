import { Injectable } from '@angular/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { FileDropEvent } from './drop.models';

const FILE_DROP = 'file-drop';

/**
 * Files dragged from Finder/Explorer onto this window (design 071 E1): Rust passes the window's
 * drag-drop events on as `file-drop` and remembers dropped paths as chosen by the user. Tests and
 * the browser mode use `FakeDropApi`.
 */
@Injectable()
export abstract class DropApi {
  /** Calls `fn` for every phase of a drag; returns the function that stops listening. */
  abstract onFileDrop(fn: (e: FileDropEvent) => void): Promise<() => void>;
}

@Injectable()
export class TauriDropApi extends DropApi {
  onFileDrop(fn: (e: FileDropEvent) => void): Promise<() => void> {
    return getCurrentWebviewWindow().listen<FileDropEvent>(FILE_DROP, (e) => fn(e.payload));
  }
}
