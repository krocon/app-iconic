import { Injectable, inject, signal } from '@angular/core';
import { RecentFilesApi } from '../../core/recent/recent-files-api';
import { RecentFile } from '../../core/recent/recent.models';

/**
 * "Open Recent" (design 003 E12): the list lives in Rust; `refresh()` validates it each time the
 * menu opens (missing files are left out). Errors leave the list as it was.
 */
@Injectable({ providedIn: 'root' })
export class RecentFilesService {
  private readonly api = inject(RecentFilesApi);
  readonly files = signal<RecentFile[]>([]);

  async refresh(): Promise<void> {
    try {
      this.files.set(await this.api.list());
    } catch {
      // no backend / unreadable: keep what we have
    }
  }

  async add(path: string): Promise<void> {
    try {
      this.files.set(await this.api.add(path));
    } catch {
      // the document is open anyway
    }
  }

  async clear(): Promise<void> {
    try {
      await this.api.clear();
      this.files.set([]);
    } catch {
      // keep the list
    }
  }
}
