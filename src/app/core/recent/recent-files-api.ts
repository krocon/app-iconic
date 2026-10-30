import { Injectable } from '@angular/core';
import { call } from '../backend/call';
import { RecentEntry, RecentFile } from './recent.models';

/**
 * "Open Recent" (design 003 E12): `recent.json` in Rust, at most 10, newest first. `list()`
 * returns only files that still exist. Tests use `FakeRecentFilesApi`.
 */
export abstract class RecentFilesApi {
  abstract list(): Promise<RecentFile[]>;
  /** After open/save: `path` to the front; returns the new list. */
  abstract add(path: string): Promise<RecentFile[]>;
  abstract clear(): Promise<void>;
  /** The start screen's entries (prompt 082): existing files with folder and preview image. */
  abstract entries(): Promise<RecentEntry[]>;
  /**
   * Renders `svg` (the icon as the canvas shows it) as preview of `path`; `false` when `path` is
   * not in the list. The previews live in Rust's cache, never in the `.icon`.
   */
  abstract saveThumbnail(path: string, svg: string): Promise<boolean>;
}

@Injectable()
export class TauriRecentFilesApi extends RecentFilesApi {
  /** The bridge (`call.ts`); a test replaces it to check the argument names. */
  protected backend: typeof call = call;

  list(): Promise<RecentFile[]> {
    return this.backend<RecentFile[]>('recent_files');
  }

  add(path: string): Promise<RecentFile[]> {
    return this.backend<RecentFile[]>('add_recent_file', { path });
  }

  clear(): Promise<void> {
    return this.backend<void>('clear_recent_files');
  }

  entries(): Promise<RecentEntry[]> {
    return this.backend<RecentEntry[]>('recent_entries');
  }

  saveThumbnail(path: string, svg: string): Promise<boolean> {
    return this.backend<boolean>('save_thumbnail', { path, svg });
  }
}
