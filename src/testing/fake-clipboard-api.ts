import { ClipboardApi } from '../app/core/clipboard/clipboard-api';

/** The clipboard in memory (unit tests). */
export class FakeClipboardApi extends ClipboardApi {
  text = '';
  fail = false;

  writeText(text: string): Promise<void> {
    if (this.fail) return Promise.reject(new Error('denied'));
    this.text = text;
    return Promise.resolve();
  }

  readText(): Promise<string> {
    return this.fail ? Promise.reject(new Error('denied')) : Promise.resolve(this.text);
  }
}
