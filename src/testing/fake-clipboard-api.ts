import { ClipboardApi } from '../app/core/clipboard/clipboard-api';
import { ImageFileDto } from '../app/core/icon-file/icon-file.models';

/** The clipboard in memory (unit tests). */
export class FakeClipboardApi extends ClipboardApi {
  text = '';
  /** The image `readImage` returns (design 071). */
  image: ImageFileDto | null = null;
  fail = false;

  writeText(text: string): Promise<void> {
    if (this.fail) return Promise.reject(new Error('denied'));
    this.text = text;
    return Promise.resolve();
  }

  readText(): Promise<string> {
    return this.fail ? Promise.reject(new Error('denied')) : Promise.resolve(this.text);
  }

  readImage(): Promise<ImageFileDto | null> {
    return this.fail ? Promise.reject(new Error('denied')) : Promise.resolve(this.image);
  }
}
