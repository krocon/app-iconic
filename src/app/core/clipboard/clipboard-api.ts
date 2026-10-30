import { Injectable } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { call } from '../backend/call';
import { FsError } from '../errors/fs-error';
import { ImageFileDto } from '../icon-file/icon-file.models';

/** The image limit of `image_file` (Rust `MAX_IMAGE`). */
export const MAX_CLIPBOARD_IMAGE = 20 * 1024 * 1024;

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * The system clipboard (design 006 E12): SVG markup is copied and pasted as text, so it works
 * between documents, windows and other apps – the WebView's own `navigator.clipboard` is enough for
 * text. Images (screenshots, images copied in other apps – design 071 E5) are read by Rust from the
 * platform clipboard (`read_clipboard_image`, no Tauri clipboard plugin for the WebView, 001 E4);
 * in the browser mode by `navigator.clipboard.read()`. Tests replace the facade with
 * `FakeClipboardApi`.
 */
@Injectable({ providedIn: 'root', useFactory: () => new WebClipboardApi() })
export abstract class ClipboardApi {
  abstract writeText(text: string): Promise<void>;
  abstract readText(): Promise<string>;
  /** The clipboard's image as PNG data URL with its size; `null` if it holds none. */
  abstract readImage(): Promise<ImageFileDto | null>;
}

function fsError(code: FsError['code'], message: string): FsError {
  return { code, message };
}

function startsWith(bytes: Uint8Array, magic: number[], at = 0): boolean {
  return magic.every((b, i) => bytes[at + i] === b);
}

/** The kind from the magic bytes (like Rust `image_file::detect`), never from the blob's type. */
export function imageMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp';
  return null;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/**
 * An image from a paste event or `navigator.clipboard.read()` as data URL: at most 20 MiB, PNG,
 * JPEG or WebP by its magic bytes; the size from the browser's decoder (`null` without one).
 */
export async function imageFromBlob(blob: Blob): Promise<ImageFileDto> {
  if (blob.size > MAX_CLIPBOARD_IMAGE) throw fsError('too_large', 'image too large');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = imageMime(bytes);
  if (!mime) throw fsError('invalid_image', 'not a PNG, JPEG or WebP image');
  let width: number | null = null;
  let height: number | null = null;
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
    width = bmp.width;
    height = bmp.height;
    bmp.close();
  } catch {
    // no decoder (jsdom): the size stays open, "Add › Image" uses its default
  }
  return {
    name: 'clipboard.png',
    mime,
    dataUrl: `data:${mime};base64,${base64(bytes)}`,
    width,
    height,
  };
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

  async readImage(): Promise<ImageFileDto | null> {
    if (isTauri()) return call<ImageFileDto | null>('read_clipboard_image');
    const c = globalThis.navigator?.clipboard;
    if (!c?.read) return null;
    for (const item of await c.read()) {
      const type = item.types.find((t) => IMAGE_TYPES.includes(t));
      if (type) return imageFromBlob(await item.getType(type));
    }
    return null;
  }
}
