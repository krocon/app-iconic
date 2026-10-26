import { Injectable } from '@angular/core';
import { WindowApi } from '../app/core/window/window-api';

/**
 * Test double of {@link WindowApi}: records titles and opened windows; `requestClose()` plays
 * the close button. In the browser it also sets `document.title` (marker as on Linux/Windows),
 * so Playwright can check the title. Never imported by app code.
 */
@Injectable()
export class FakeWindowApi extends WindowApi {
  /** Every title set, newest last: `[title, edited, path]`. */
  readonly titles: [string, boolean, string | null][] = [];
  /** Paths (or `null`) of every window opened. */
  readonly opened: (string | null)[] = [];
  /** Paths another window shows (`focusDocumentWindow` answers `true`). */
  readonly elsewhere = new Set<string>();
  start: string | null = null;
  tookOverClose = false;
  closed = false;
  /** Mirror `setTitle` into `document.title` (browser mode). */
  setDocumentTitle = false;
  private closeHandler: (() => void) | null = null;

  /** The title as Linux/Windows would show it. */
  get title(): string {
    const last = this.titles.at(-1);
    return last ? (last[1] ? '• ' : '') + last[0] : '';
  }

  async setTitle(title: string, edited: boolean, path: string | null): Promise<void> {
    this.titles.push([title, edited, path]);
    if (this.setDocumentTitle && typeof document !== 'undefined') document.title = this.title;
  }

  async openDocumentWindow(path: string | null): Promise<string> {
    this.opened.push(path);
    return `doc-${this.opened.length}`;
  }

  async focusDocumentWindow(path: string): Promise<boolean> {
    return this.elsewhere.has(path);
  }

  async startPath(): Promise<string | null> {
    const s = this.start;
    this.start = null;
    return s;
  }

  async takeOverClose(): Promise<void> {
    this.tookOverClose = true;
  }

  async closeWindow(): Promise<void> {
    this.closed = true;
  }

  async onCloseRequested(fn: () => void): Promise<() => void> {
    this.closeHandler = fn;
    return () => (this.closeHandler = null);
  }

  /** Plays the window's close button. */
  requestClose(): void {
    if (this.tookOverClose) this.closeHandler?.();
    else this.closed = true;
  }
}
