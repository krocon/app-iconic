import { TestBed } from '@angular/core/testing';
import { FakeClipboardApi } from '../../../testing/fake-clipboard-api';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { ClipboardApi, imageFromBlob, imageMime } from '../../core/clipboard/clipboard-api';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { EditService } from '../hierarchy/edit.service';
import { AddService } from './add.service';

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('paste an image (design 071 E5)', () => {
  let clipboard: FakeClipboardApi;
  let store: DocumentStore;
  let edit: EditService;
  let files: FilesService;

  beforeEach(() => {
    clipboard = new FakeClipboardApi();
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [
        ...backend.providers,
        { provide: OS, useValue: 'other' },
        { provide: ClipboardApi, useValue: clipboard },
      ],
    });
    store = new DocumentStore(treeDocument());
    files = TestBed.inject(FilesService);
    files.store.set(store);
    TestBed.inject(AddService); // sets the image paster
    edit = TestBed.inject(EditService);
  });

  const images = () =>
    [...store.document().assets.values()].flatMap((a) =>
      Array.from(a.svg?.root.querySelectorAll('image') ?? []),
    );

  it('SVG text first, then the clipboard image', async () => {
    clipboard.text = '<rect width="3" height="4"/>';
    clipboard.image = {
      name: 'clipboard.png',
      mime: 'image/png',
      dataUrl: PNG,
      width: 8,
      height: 6,
    };
    await edit.paste();
    expect(images()).toHaveLength(0);
    clipboard.text = 'just words';
    expect(await edit.paste()).toBe(true);
    expect(images()).toHaveLength(1);
    expect(images()[0].getAttribute('width')).toBe('8');
    expect(store.undoLabel()).toBe('Undo Add Image');
  });

  it('markup from a caller never pastes the image; nothing at all is reported', async () => {
    clipboard.image = {
      name: 'clipboard.png',
      mime: 'image/png',
      dataUrl: PNG,
      width: 8,
      height: 6,
    };
    expect(await edit.paste('no svg')).toBe(false);
    expect(images()).toHaveLength(0);
    clipboard.image = null;
    expect(await edit.paste()).toBe(false);
    expect(files.notice()).toContain('no SVG');
  });

  it('an image of a paste event is checked by its magic bytes', async () => {
    const blob = new Blob([new Uint8Array(PNG_BYTES)], { type: 'image/png' });
    expect(await edit.paste('', blob)).toBe(true);
    expect(images()[0].getAttribute('href')).toMatch(/^data:image\/png;base64,/);
    const fake = new Blob(['<html>'], { type: 'image/png' });
    expect(await edit.paste('', fake)).toBe(false);
    expect(files.notice()).toContain('not a PNG');
  });

  it('knows PNG, JPEG and WebP; refuses big blobs', async () => {
    expect(imageMime(new Uint8Array(PNG_BYTES))).toBe('image/png');
    expect(imageMime(new Uint8Array([0xff, 0xd8, 0xff, 0]))).toBe('image/jpeg');
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
    expect(imageMime(webp)).toBe('image/webp');
    expect(imageMime(new Uint8Array([1, 2, 3]))).toBeNull();
    const big = { size: 21 * 1024 * 1024 } as Blob;
    await expect(imageFromBlob(big)).rejects.toMatchObject({ code: 'too_large' });
  });
});
