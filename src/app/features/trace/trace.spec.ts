import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { fakePng } from '../../../testing/fake-trace-api';
import { FakeClipboardApi } from '../../../testing/fake-clipboard-api';
import { smallDocument } from '../../../testing/documents';
import { checkArgs } from '../../core/actions/action-args';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { ClipboardApi } from '../../core/clipboard/clipboard-api';
import { DialogService } from '../../shared/dialog/dialog.service';
import { clearRasterSizes, rememberRasterSize } from '../canvas/raster-size';
import { AddLayer, AddRasterAsset } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { groups, layers, newLayer } from '../document/model/icon-json';
import { FilesService } from '../files/files.service';
import { TemplateStore } from '../template/template.store';
import { registerTraceActions } from './trace-actions';
import { tracedStem, tracePlan, traceScale, TraceSource } from './trace-plan';
import {
  overridesOf,
  TRACE_ARGS,
  TRACE_DEFAULTS,
  TRACE_PRESET_IDS,
  TRACE_PRESETS,
  traceOptions,
} from './trace-presets';
import { TraceService } from './trace.service';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';

describe('trace presets (prompt 087 E4)', () => {
  it('defaults, then the preset, then the changes, then the scale', () => {
    expect(traceOptions('detail', {}, 1)).toEqual(TRACE_DEFAULTS);
    const o = traceOptions('shapes', { speckle: 9 }, 2);
    expect(o).toMatchObject({
      shapes: true,
      gradients: true,
      harmonize: true,
      speckle: 9,
      scale: 2,
    });
    expect(traceOptions('mono', {}, 1).mode).toBe('mono');
    expect(traceOptions('pixel', {}, 1).curves).toBe('pixel');
    expect(TRACE_PRESET_IDS.every((p) => p in TRACE_PRESETS)).toBe(true);
  });

  it('arguments of trace.image: checked, the changes picked out', () => {
    expect(checkArgs(TRACE_ARGS, { source: 'template', preset: 'shapes', speckle: 8 })).toBe(true);
    expect(checkArgs(TRACE_ARGS, { source: 'web' })).toBe(false);
    expect(checkArgs(TRACE_ARGS, { colorPrecision: 9 })).toBe(false);
    expect(checkArgs(TRACE_ARGS, { scale: 3 })).toBe(false);
    expect(overridesOf({ source: 'layer', preset: 'flat', shapes: false, speckle: 3 })).toEqual({
      shapes: false,
      speckle: 3,
    });
  });
});

describe('trace plan (prompt 087 E13)', () => {
  const image = (w: number, h: number) => ({
    name: 'Calc.png',
    dataUrl: fakePng(w, h),
    width: w,
    height: h,
  });

  it('a layer keeps its pixels, every other image fills the canvas', () => {
    const layer = { kind: 'layer' as const, group: 0, layer: 0 };
    expect(traceScale({ kind: 'layer', image: image(512, 512), layer })).toBe(1);
    expect(traceScale({ kind: 'template', image: image(512, 256) })).toBe(2);
    expect(traceScale({ kind: 'file', image: image(2048, 2048) })).toBe(0.5);
    expect(tracedStem('Calc.png')).toBe('Calc-traced');
    expect(tracedStem('  ')).toBe('image-traced');
  });

  it('from a layer: in front of it, with its position, one step "Trace Image"', () => {
    const doc = smallDocument();
    const store = new DocumentStore(doc);
    const position = { scale: 0.5, 'translation-in-points': [10, -20] };
    store.execute(new AddRasterAsset('Calc.png', fakePng(512, 512)));
    store.execute(new AddLayer(0, { ...newLayer('Calc.png', 'Calc'), position }, 0));
    const before = layers(groups(store.document().iconJson)[0]).length;
    const src: TraceSource = {
      kind: 'layer',
      image: image(512, 512),
      layer: { kind: 'layer', group: 0, layer: 0 },
    };
    const plan = tracePlan(store.document(), src, SVG, { nodes: [], items: [] });
    store.execute(plan.command);
    const ls = layers(groups(store.document().iconJson)[0]);
    expect(ls.length).toBe(before + 1);
    expect(ls[0]).toMatchObject({ 'image-name': 'Calc-traced.svg', name: 'Calc-traced', position });
    expect(ls[1]['image-name']).toBe('Calc.png');
    expect(store.document().asset('Calc-traced.svg')?.svg).toBeTruthy();
    expect(store.undoTitle).toContain('Trace Image');
    store.undo();
    expect(store.document().asset('Calc-traced.svg')).toBeUndefined();
  });

  it('from the template: in front of the active group, no position', () => {
    const store = new DocumentStore(smallDocument());
    const plan = tracePlan(store.document(), { kind: 'template', image: image(1024, 1024) }, SVG, {
      nodes: [],
      items: [],
    });
    store.execute(plan.command);
    const l = layers(groups(store.document().iconJson)[0])[0];
    expect(l['image-name']).toBe('Calc-traced.svg');
    expect(l['position']).toBeUndefined();
  });
});

describe('TraceService (prompt 087)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let files: FilesService;
  let store: DocumentStore;
  let actions: ActionService;
  let service: TraceService;
  let templates: TemplateStore;
  let clipboard: FakeClipboardApi;

  beforeEach(() => {
    backend = fakeBackend();
    clipboard = new FakeClipboardApi();
    TestBed.configureTestingModule({
      providers: [
        ...backend.providers,
        { provide: OS, useValue: 'other' },
        { provide: ClipboardApi, useValue: clipboard },
      ],
    });
    files = TestBed.inject(FilesService);
    store = new DocumentStore(smallDocument());
    files.store.set(store);
    actions = TestBed.inject(ActionService);
    service = TestBed.inject(TraceService);
    templates = TestBed.inject(TemplateStore);
    registerTraceActions(actions, service);
  });

  afterEach(() => clearRasterSizes());

  it('with arguments: traces the template at canvas scale and inserts one layer', async () => {
    templates.set({ name: 'Calc.png', dataUrl: fakePng(512, 512), width: 512, height: 512 });
    expect(
      await actions.runAsync('trace.image', { source: 'template', preset: 'shapes', speckle: 6 }),
    ).toBe(true);
    const call = backend.trace.calls[0];
    expect(call.options).toMatchObject({ shapes: true, gradients: true, speckle: 6, scale: 2 });
    const doc = store.document();
    const svg = doc.asset('Calc-traced.svg')?.svg;
    expect(svg?.root.querySelector('rect')?.getAttribute('width')).toBe('1024');
    expect(store.items()).toEqual([{ kind: 'layer', group: 0, layer: 0 }]);
    expect(files.notice()).toContain('Calc-traced');
    store.undo();
    expect(store.document().asset('Calc-traced.svg')).toBeUndefined();
  });

  it('without a template the AI call fails with unavailable; Rust errors pass through', async () => {
    await expect(actions.runAsync('trace.image', { source: 'template' })).rejects.toMatchObject({
      code: 'unavailable',
    });
    templates.set({ name: 'x.png', dataUrl: fakePng(10, 10), width: 10, height: 10 });
    backend.trace.failWith = 'too_large';
    await expect(actions.runAsync('trace.image', { source: 'template' })).rejects.toMatchObject({
      code: 'too_large',
    });
  });

  it('the best source: the selected PNG layer, then the template, else a file', async () => {
    expect(service.bestSource()).toBe('file');
    templates.set({ name: 't.png', dataUrl: fakePng(10, 10), width: 10, height: 10 });
    expect(service.bestSource()).toBe('template');
    const png = fakePng(200, 100);
    rememberRasterSize(png, 200, 100);
    store.execute(new AddRasterAsset('Ball.png', png));
    store.execute(new AddLayer(0, newLayer('Ball.png', 'Ball'), 0));
    store.selectItems([{ kind: 'layer', group: 0, layer: 0 }]);
    expect(service.bestSource()).toBe('layer');
    // without arguments: the dialog with that source
    expect(await actions.runAsync('trace.image')).toBe(true);
    expect(TestBed.inject(DialogService).open()).toBe('trace');
    expect(service.source()).toMatchObject({
      kind: 'layer',
      image: { name: 'Ball.png', width: 200 },
    });
    expect(service.options()?.scale).toBe(1);
  });

  it('the clipboard and a file as sources; nothing there is a notice', async () => {
    expect(await actions.runAsync('trace.clipboard')).toBe(true);
    expect(TestBed.inject(DialogService).open()).toBeNull();
    expect(files.notice()).toContain('no image');
    clipboard.image = {
      name: 'clipboard.png',
      mime: 'image/png',
      dataUrl: fakePng(64, 64),
      width: 64,
      height: 64,
    };
    await actions.runAsync('trace.clipboard');
    expect(service.source()).toMatchObject({ kind: 'clipboard', image: { width: 64 } });
    backend.files.imageFiles.set('/p.png', {
      name: 'p.png',
      mime: 'image/png',
      dataUrl: fakePng(8, 8),
      width: 8,
      height: 8,
    });
    backend.files.picks.push('/p.png');
    expect(await service.useSource('file')).toBe(true);
    expect(service.source()).toMatchObject({ kind: 'file', image: { name: 'p.png' } });
    expect(files.busy()).toBe(false);
  });

  it('a preset resets the changes; changes add up', () => {
    service.change({ speckle: 12 });
    service.change({ shapes: false });
    expect(service.overrides()).toEqual({ speckle: 12, shapes: false });
    service.choosePreset('flat');
    expect(service.overrides()).toEqual({});
  });
});
