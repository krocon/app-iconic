import { Injectable } from '@angular/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { call } from '../backend/call';

/** Event the backend sends to a window whose close button was pressed (design 003 E10). */
export const CLOSE_REQUESTED = 'close-requested';

/**
 * The document window (design 003 E8–E11): title with unsaved marker, more windows, closing
 * with a question first. One document per window. Tests use `FakeWindowApi`.
 */
export abstract class WindowApi {
  /** `title` (file name or "Untitled"); the backend adds the marker per OS. `path`: the file
   * the window shows, so opening it again brings this window to the front. */
  abstract setTitle(title: string, edited: boolean, path: string | null): Promise<void>;
  /** New window with a new document (`null`) or with `path`; returns its label. A window that
   * already shows `path` comes to the front instead. */
  abstract openDocumentWindow(path: string | null): Promise<string>;
  /** `true` if another window shows `path` (it is now in front). */
  abstract focusDocumentWindow(path: string): Promise<boolean>;
  /** The file this window was opened for (once); `null` = start with a new document. */
  abstract startPath(): Promise<string | null>;
  /** From now on the close button calls `onCloseRequested` instead of closing. */
  abstract takeOverClose(): Promise<void>;
  /** Closes this window (after unsaved changes were dealt with). */
  abstract closeWindow(): Promise<void>;
  abstract onCloseRequested(fn: () => void): Promise<() => void>;
}

@Injectable()
export class TauriWindowApi extends WindowApi {
  /** The bridge (`call.ts`); a test replaces it to check the argument names. */
  protected backend: typeof call = call;

  setTitle(title: string, edited: boolean, path: string | null): Promise<void> {
    return this.backend<void>('set_window_title', { title, edited, path });
  }

  openDocumentWindow(path: string | null): Promise<string> {
    return this.backend<string>('open_document_window', { path });
  }

  focusDocumentWindow(path: string): Promise<boolean> {
    return this.backend<boolean>('focus_document_window', { path });
  }

  startPath(): Promise<string | null> {
    return this.backend<string | null>('window_start_path');
  }

  takeOverClose(): Promise<void> {
    return this.backend<void>('take_over_close');
  }

  closeWindow(): Promise<void> {
    return this.backend<void>('close_window');
  }

  onCloseRequested(fn: () => void): Promise<() => void> {
    return getCurrentWebviewWindow().listen(CLOSE_REQUESTED, () => fn());
  }
}
