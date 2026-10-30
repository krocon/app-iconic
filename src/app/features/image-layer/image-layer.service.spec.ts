import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FakeIconFileApi } from '../../../testing/fake-icon-file-api';
import { smallDocument } from '../../../testing/documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { clearRasterSizes, knownRasterSize } from '../canvas/raster-size';
import { DocumentStore } from '../document/document.store';
import { newLayer } from '../document/model/icon-json';
import { FilesService } from '../files/files.service';
import { registerImageLayerActions } from './image-layer-actions';
import { ImageLayerService } from './image-layer.service';
import { RasterConverter } from './raster-converter';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const CONVERTED = 'data:image/png;base64,iVBORw0KGgoCONVERTED=';

describe('ImageLayerService (prompt 080)', () => {
  let api: FakeIconFileApi;
  let files: FilesService;
  let service: ImageLayerService;
  let actions: ActionService;
  let store: DocumentStore;
  const converted: string[] = [];

  beforeEach(() => {
    const backend = fakeBackend();
    api = backend.files;
    TestBed.configureTestingModule({
      providers: [
        ...backend.providers,
        { provide: OS, useValue: 'other' },
        {
          provide: RasterConverter,
          useValue: {
            toPng: async (url: string) => {
              converted.push(url);
              return url.includes('broken') ? null : { dataUrl: CONVERTED, width: 64, height: 32 };
            },
          },
        },
      ],
    });
    files = TestBed.inject(FilesService);
    store = new DocumentStore(smallDocument());
    files.store.set(store);
    service = TestBed.inject(ImageLayerService);
    actions = TestBed.inject(ActionService);
    registerImageLayerActions(actions, service);
    api.imageFiles.set('/img/Ball.png', {
      name: 'Ball.png',
      mime: 'image/png',
      dataUrl: PNG,
      width: 512,
      height: 256,
    });
    api.imageFiles.set('/img/photo.jpg', {
      name: 'photo.jpg',
      mime: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,/9j/',
      width: 64,
      height: 32,
    });
    converted.length = 0;
  });

  afterEach(() => clearRasterSizes());

  it('PNG: kept byte for byte, size from the header, the new layer selected', async () => {
    api.picks.push('/img/Ball.png');
    expect(await actions.runAsync('file.importImageLayer')).toBe(true);
    const doc = store.document();
    expect(doc.asset('Ball.png')).toMatchObject({ kind: 'png', dataUrl: PNG });
    expect(doc.iconJson.groups![0].layers![0]).toEqual({ 'image-name': 'Ball.png', name: 'Ball' });
    expect(store.items()).toEqual([{ kind: 'layer', group: 0, layer: 0 }]);
    expect(knownRasterSize(PNG)).toEqual({ width: 512, height: 256 });
    expect(converted).toEqual([]);
    expect(files.notice()).toContain('Ball');
  });

  it('JPEG: converted to a PNG asset; cancelled dialog changes nothing', async () => {
    api.picks.push('/img/photo.jpg');
    await actions.runAsync('file.importImageLayer');
    expect(store.document().asset('photo.png')).toMatchObject({ kind: 'png', dataUrl: CONVERTED });
    expect(files.notice()).toContain('PNG');
    const before = store.document().snapshot();
    await actions.runAsync('file.importImageLayer');
    expect(store.document().snapshot()).toBe(before);
  });

  it('errors go to the status line, nothing changes', async () => {
    api.picks.push('/img/missing.png');
    const before = store.document().snapshot();
    expect(await service.importImageLayer()).toBe(false);
    expect(files.notice()).toContain('could not be imported');
    expect(store.document().snapshot()).toBe(before);
  });

  it('saving sends the new PNG as data URL, later only its name', async () => {
    api.picks.push('/img/Ball.png');
    await service.importImageLayer();
    const doc = store.document();
    let req = doc.saveRequest('/a.icon', 'bundle');
    expect(req.assets.find((a) => a.name === 'Ball.png')).toEqual({
      name: 'Ball.png',
      unchanged: false,
      dataUrl: PNG,
    });
    // the PNG the file was opened with: by name
    expect(req.assets.find((a) => a.name === 'p.png')).toEqual({ name: 'p.png', unchanged: true });
    doc.markSaved({ path: '/a.icon', name: 'a.icon', format: 'bundle' });
    req = doc.saveRequest('/a.icon', 'bundle');
    expect(req.assets.find((a) => a.name === 'Ball.png')).toEqual({
      name: 'Ball.png',
      unchanged: true,
    });
  });

  it('Replace Layer Image: only with a PNG layer selected; a replaced image is sent again', async () => {
    const doc = store.document();
    doc.iconJson = { groups: [{ layers: [newLayer('p.png', 'p')] }] };
    expect(service.canReplace()).toBe(false);
    store.selectItems([{ kind: 'layer', group: 0, layer: 0 }]);
    expect(service.canReplace()).toBe(true);
    api.picks.push('/img/photo.jpg');
    expect(await actions.runAsync('file.replaceLayerImage')).toBe(true);
    expect(doc.asset('p.png')!.dataUrl).toBe(CONVERTED);
    expect(doc.saveRequest('/a.icon', 'bundle').assets[1]).toEqual({
      name: 'p.png',
      unchanged: false,
      dataUrl: CONVERTED,
    });
    store.undo();
    expect(doc.saveRequest('/a.icon', 'bundle').assets[1]).toEqual({
      name: 'p.png',
      unchanged: true,
    });
  });

  it('a save with the new PNG round-trips through the fake backend', async () => {
    store = new DocumentStore(smallDocument(null));
    files.store.set(store);
    api.picks.push('/img/Ball.png');
    await service.importImageLayer();
    const doc = store.document();
    await api.saveIcon(doc.saveRequest('/b.icon', 'zip'));
    const back = await api.openIcon('/b.icon');
    expect(back.assets.find((a) => a.name === 'Ball.png')).toEqual({
      name: 'Ball.png',
      kind: 'png',
      dataUrl: PNG,
    });
  });
});
