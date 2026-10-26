import { Injectable } from '@angular/core';

/**
 * The system clipboard as plain text (design 006 E12) – SVG markup is copied and pasted as text,
 * so it works between documents, windows and other apps. The WebView's own
 * `navigator.clipboard` is enough in Tauri (WKWebView, WebKitGTK, WebView2; no plugin with
 * clipboard rights, 001 E4). Tests replace the facade with `FakeClipboardApi`.
 */
@Injectable({ providedIn: 'root', useFactory: () => new WebClipboardApi() })
export abstract class ClipboardApi {
  abstract writeText(text: string): Promise<void>;
  abstract readText(): Promise<string>;
}

export class WebClipboardApi extends ClipboardApi {
  writeText(text: string): Promise<void> {
    const c = globalThis.navigator?.clipboard;
    return c ? c.writeText(text) : Promise.reject(new Error('no clipboard'));
  }

  readText(): Promise<string> {
    const c = globalThis.navigator?.clipboard;
    return c ? c.readText() : Promise.reject(new Error('no clipboard'));
  }
}
