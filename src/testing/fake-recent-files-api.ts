import { Injectable } from '@angular/core';
import { RecentFilesApi } from '../app/core/recent/recent-files-api';
import { RecentFile } from '../app/core/recent/recent.models';
import { fakeName } from './fake-icon-file-api';

/** Test double of {@link RecentFilesApi} with the backend's rules (max 10). Never in app code. */
@Injectable()
export class FakeRecentFilesApi extends RecentFilesApi {
  paths: string[] = [];
  /** Paths whose file is "gone" (left out by `list`, dropped by `add`). */
  readonly missing = new Set<string>();

  private dto(paths: string[]): RecentFile[] {
    return paths.map((path) => ({ path, name: fakeName(path) }));
  }

  async list(): Promise<RecentFile[]> {
    return this.dto(this.paths.filter((p) => !this.missing.has(p)));
  }

  async add(path: string): Promise<RecentFile[]> {
    this.paths = [path, ...this.paths.filter((p) => p !== path && !this.missing.has(p))].slice(
      0,
      10,
    );
    return this.dto(this.paths);
  }

  async clear(): Promise<void> {
    this.paths = [];
  }
}
