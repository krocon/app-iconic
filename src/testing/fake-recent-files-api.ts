import { Injectable } from '@angular/core';
import { RecentFilesApi } from '../app/core/recent/recent-files-api';
import { RecentEntry, RecentFile } from '../app/core/recent/recent.models';
import { fakeName } from './fake-icon-file-api';

/** The folder of a fake path (test code may split paths; the app never does). */
function fakeLocation(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i > 0 ? path.slice(0, i) : '';
}

/**
 * Test double of {@link RecentFilesApi} with the backend's rules (max 10; previews only for listed
 * paths, removed with their entry – prompt 082). The "preview" is the SVG as data URL (the browser
 * shows it; Rust renders a PNG). Never in app code.
 */
@Injectable()
export class FakeRecentFilesApi extends RecentFilesApi {
  paths: string[] = [];
  /** Paths whose file is "gone" (left out by `list`, dropped by `add`). */
  readonly missing = new Set<string>();
  /** Preview per path (data URL). */
  readonly thumbnails = new Map<string, string>();
  /** `saveThumbnail` calls (path, svg). */
  readonly thumbnailCalls: [string, string][] = [];

  private dto(paths: string[]): RecentFile[] {
    return paths.map((path) => ({ path, name: fakeName(path) }));
  }

  private prune(): void {
    for (const p of [...this.thumbnails.keys()]) {
      if (!this.paths.includes(p)) this.thumbnails.delete(p);
    }
  }

  async list(): Promise<RecentFile[]> {
    return this.dto(this.paths.filter((p) => !this.missing.has(p)));
  }

  async add(path: string): Promise<RecentFile[]> {
    this.paths = [path, ...this.paths.filter((p) => p !== path && !this.missing.has(p))].slice(
      0,
      10,
    );
    this.prune();
    return this.dto(this.paths);
  }

  async clear(): Promise<void> {
    this.paths = [];
    this.prune();
  }

  async entries(): Promise<RecentEntry[]> {
    return this.paths
      .filter((p) => !this.missing.has(p))
      .map((path) => ({
        path,
        name: fakeName(path),
        location: fakeLocation(path),
        thumbnail: this.thumbnails.get(path) ?? null,
      }));
  }

  async saveThumbnail(path: string, svg: string): Promise<boolean> {
    this.thumbnailCalls.push([path, svg]);
    this.prune();
    if (!this.paths.includes(path)) return false;
    this.thumbnails.set(path, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    return true;
  }
}
