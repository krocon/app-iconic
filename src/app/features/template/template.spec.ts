import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { fakePng } from '../../../testing/fake-trace-api';
import { FakeClipboardApi } from '../../../testing/fake-clipboard-api';
import { ClipboardApi } from '../../core/clipboard/clipboard-api';
import { smallDocument } from '../../../testing/documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { clearRasterSizes, rememberRasterSize } from '../canvas/raster-size';
import { AddRasterAsset, AddLayer } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { newLayer } from '../document/model/icon-json';
import { FilesService } from '../files/files.service';
import { RasterConverter } from '../image-layer/raster-converter';
import { clampOpacity, fitScale, percentOf, TEMPLATE_OPACITY, templatePlacement } from './template';
import { nextOpacity, registerTemplateActions } from './template-actions';
import { TemplateService } from './template.service';
import { TemplateStore } from './template.store';

describe('template geometry (prompt 087 E12)', () => {
  it('fits the longer side into the canvas, centred', () => {
    expect(fitScale(1024, 1024)).toBe(1);
    expect(fitScale(512, 256)).toBe(2);
    expect(fitScale(2048, 1024)).toBe(0.5);
    expect(templatePlacement(2048, 1024)).toEqual({ x: 0, y: 256, width: 1024, height: 512 });
    expect(templatePlacement(100, 200)).toEqual({ x: 256, y: 0, width: 512, height: 1024 });
    expect(percentOf({ x: 256, y: 0, width: 512, height: 1024 })).toEqual({
      x: 25,
      y: 0,
      width: 50,
      height: 100,
    });
  });

  it('opacity stays in range; the menu steps round', () => {
    expect(clampOpacity(0)).toBe(TEMPLATE_OPACITY.min);
    expect(clampOpacity(3)).toBe(1);
    expect(clampOpacity(NaN)).toBe(TEMPLATE_OPACITY.initial);
    expect(nextOpacity(0.5)).toBe(0.75);
    expect(nextOpacity(1)).toBe(0.25);
    expect(nextOpacity(0.3)).toBe(0.5);
  });
});

describe('TemplateService and actions (prompt 087 E12)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let files: FilesService;
  let store: DocumentStore;
  let templates: TemplateStore;
  let actions: ActionService;
  let clipboard: FakeClipboardApi;
  const converted: { url: string; max?: number }[] = [];

  beforeEach(() => {
    backend = fakeBackend();
    clipboard = new FakeClipboardApi();
    TestBed.configureTestingModule({
      providers: [
        ...backend.providers,
        { provide: OS, useValue: 'other' },
        { provide: ClipboardApi, useValue: clipboard },
        {
          provide: RasterConverter,
          useValue: {
            toPng: async (url: string, max?: number) => {
              converted.push({ url, max });
              return url.includes('broken')
                ? null
                : {
                    dataUrl: fakePng(max ?? 300, max ? max / 2 : 150),
                    width: max ?? 300,
                    height: max ? max / 2 : 150,
                  };
            },
          },
        },
      ],
    });
    files = TestBed.inject(FilesService);
    store = new DocumentStore(smallDocument());
    files.store.set(store);
    templates = TestBed.inject(TemplateStore);
    actions = TestBed.inject(ActionService);
    registerTemplateActions(actions, TestBed.inject(TemplateService));
    converted.length = 0;
  });

  afterEach(() => clearRasterSizes());

  it('from a file: a PNG as it is, shown, half transparent', async () => {
    const png = fakePng(400, 200);
    backend.files.imageFiles.set('/pics/a.png', {
      name: 'a.png',
      mime: 'image/png',
      dataUrl: png,
      width: 400,
      height: 200,
    });
    backend.files.picks.push('/pics/a.png');
    expect(await actions.runAsync('template.fromFile')).toBe(true);
    expect(templates.image()).toEqual({ name: 'a.png', dataUrl: png, width: 400, height: 200 });
    expect(templates.shown()).toBe(true);
    expect(templates.opacity()).toBe(0.5);
    expect(templates.placement()).toEqual({ x: 0, y: 256, width: 1024, height: 512 });
    expect(converted).toEqual([]);
    expect(files.notice()).toContain('a.png');
  });

  it('from the clipboard: a JPEG is drawn to PNG once; no image is a notice', async () => {
    clipboard.image = null;
    expect(await actions.runAsync('template.fromClipboard')).toBe(true);
    expect(templates.image()).toBeNull();
    expect(files.notice()).toContain('no image');
    clipboard.image = {
      name: 'clipboard.png',
      mime: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,/9j/',
      width: null,
      height: null,
    };
    await actions.runAsync('template.fromClipboard');
    expect(templates.image()).toMatchObject({ name: 'clipboard.png', width: 300, height: 150 });
    expect(converted[0].url).toContain('image/jpeg');
  });

  it('from the selected PNG layer; show, opacity steps, remove', async () => {
    const png = fakePng(64, 32);
    rememberRasterSize(png, 64, 32);
    store.execute(new AddRasterAsset('dot.png', png));
    store.execute(new AddLayer(0, newLayer('dot.png', 'dot'), 0));
    store.selectItems([{ kind: 'layer', group: 0, layer: 0 }]);
    expect(actions.enabled('template.fromLayer')).toBe(true);
    await actions.runAsync('template.fromLayer');
    expect(templates.image()).toEqual({ name: 'dot.png', dataUrl: png, width: 64, height: 32 });
    actions.run('template.toggle');
    expect(templates.shown()).toBe(false);
    actions.run('template.toggle');
    actions.run('template.opacity');
    expect(templates.opacity()).toBe(0.75);
    actions.run('template.opacity', { value: 0.3 });
    expect(templates.opacity()).toBe(0.3);
    actions.run('template.clear');
    expect(templates.image()).toBeNull();
    expect(actions.enabled('template.toggle')).toBe(false);
  });

  it('the AI gets at most 1024 px; a path sets it', async () => {
    const service = TestBed.inject(TemplateService);
    expect(await service.forAi()).toBeNull();
    backend.files.imageFiles.set('/big.png', {
      name: 'big.png',
      mime: 'image/png',
      dataUrl: fakePng(4000, 2000),
      width: 4000,
      height: 2000,
    });
    const img = await service.fromPath('/big.png');
    expect(img.width).toBe(4000);
    const ai = await service.forAi();
    expect(converted.at(-1)?.max).toBe(1024);
    expect(ai).toMatchObject({ name: 'big.png', placement: { x: 0, y: 256, width: 1024 } });
    expect(ai!.dataUrl).not.toBe(img.dataUrl);
  });
});
