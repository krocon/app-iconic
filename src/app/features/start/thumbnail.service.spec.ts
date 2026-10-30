import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FakeIconFileApi } from '../../../testing/fake-icon-file-api';
import { SetAttribute } from '../document/commands';
import { FilesService } from '../files/files.service';
import { ThumbnailService } from './thumbnail.service';
import { templateDocument } from './start-templates';

const CAM = FakeIconFileApi.CAMSCANNER;

/** Previews of opened/saved files (design 082 E4/E5). */
describe('ThumbnailService', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let files: FilesService;
  let thumbs: ThumbnailService;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({ providers: backend.providers });
    files = TestBed.inject(FilesService);
    thumbs = TestBed.inject(ThumbnailService);
  });

  it('records a preview after opening, as the canvas shows the icon (light, masked)', async () => {
    backend.window.start = CAM;
    await files.start();
    expect(await thumbs.pending).toBe(true);
    const [path, svg] = backend.recent.thumbnailCalls[0];
    expect(path).toBe(CAM);
    expect(svg).toContain('<svg');
    expect(svg).toContain('clipPath'); // the view's mask (squircle)
    expect(svg).not.toContain('data-ai-id');
  });

  it('records again after saving; Save As moves the preview to the new path', async () => {
    backend.window.start = CAM;
    await files.start();
    await thumbs.pending;
    const s = files.store()!;
    const asset = [...s.document().assets.keys()][0];
    const id = s.document().assets.get(asset)!.svg!.root.getAttribute('data-ai-id')!;
    s.execute(new SetAttribute({ asset, id }, 'opacity', '0.5'));
    await files.saveQuietly();
    await thumbs.pending;
    expect(backend.recent.thumbnailCalls.map((c) => c[0])).toEqual([CAM, CAM]);
    expect(backend.recent.thumbnailCalls[1][1]).toContain('opacity="0.5"');
    await files.saveQuietly('/b/copy.icon');
    await thumbs.pending;
    expect(backend.recent.thumbnails.has('/b/copy.icon')).toBe(true);
  });

  it('a template has no file and no preview; another path is not rendered', async () => {
    await files.start();
    await files.newFromTemplate(templateDocument('ios'));
    expect(backend.recent.thumbnailCalls).toEqual([]);
    expect(await thumbs.record('/other.icon')).toBe(false);
  });

  it('previews leave with their recent entry (fake follows the Rust rules)', async () => {
    const recent = backend.recent;
    await recent.add('/a.icon');
    expect(await recent.saveThumbnail('/a.icon', '<svg/>')).toBe(true);
    expect(await recent.saveThumbnail('/x.icon', '<svg/>')).toBe(false);
    for (let i = 0; i < 10; i++) await recent.add(`/n${i}.icon`);
    expect(recent.thumbnails.has('/a.icon')).toBe(false);
    await recent.add('/b.icon');
    await recent.saveThumbnail('/b.icon', '<svg/>');
    await recent.clear();
    expect(recent.thumbnails.size).toBe(0);
  });

  it('neighbours for the mockups: other recent icons with a preview, newest first', async () => {
    const recent = backend.recent;
    for (const p of ['/a.icon', '/b.icon', '/c.icon']) await recent.add(p);
    await recent.saveThumbnail('/a.icon', '<svg id="a"/>');
    await recent.saveThumbnail('/c.icon', '<svg id="c"/>');
    const urls = await thumbs.neighbours('/c.icon');
    expect(urls).toHaveLength(1);
    expect(decodeURIComponent(urls[0])).toContain('id="a"');
  });
});
