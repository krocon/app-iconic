import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { AddService } from '../commands/add.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { FreehandStore } from '../tools/freehand.store';
import { registerSketchActions } from './sketch-actions';
import { parseSketchPoints, parseSketchValues, SketchService } from './sketch.service';
import { StyleMemory } from './style-memory';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('sketch actions (design 019 E1, E14)', () => {
  let store: DocumentStore;
  let actions: ActionService;
  let sketch: SketchService;

  beforeEach(() => {
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    actions = TestBed.inject(ActionService);
    sketch = TestBed.inject(SketchService);
    registerSketchActions(actions, TestBed.inject(AddService), sketch);
  });

  const node = () => store.document().node(store.selection()[0])!;
  const attrs = () =>
    Object.fromEntries(Array.from(node().attributes).map((a) => [a.name, a.value]));

  it('without arguments the tool goes on and off (checked); freehand goes off', () => {
    TestBed.inject(FreehandStore).toggle(true);
    actions.run('sketch.rect3p');
    expect(sketch.tool.tool()).toBe('rect3p');
    expect(actions.checked('sketch.rect3p')).toBe(true);
    expect(TestBed.inject(FreehandStore).active()).toBe(false);
    actions.run('sketch.rect3p');
    expect(sketch.tool.tool()).toBeNull();
  });

  it('points and values draw a 3-point rectangle as one step (as JSON the same)', async () => {
    actions.run('sketch.rect3p', {
      points: [
        [100, 400],
        [0, 0],
        [0, 0],
      ],
      values: { length: 200, angle: 90, height: 50 },
    });
    await flush();
    expect(node().localName).toBe('rect');
    const a = attrs();
    expect(Number(a['width'])).toBeCloseTo(200, 4);
    expect(Number(a['height'])).toBeCloseTo(50, 4);
    expect(a['transform']).toMatch(/^rotate\(-90 /);
    expect(a).toMatchObject({ fill: 'none', stroke: '#000000', 'stroke-width': '2' });
    expect(store.undoLabel()).toBe('Undo Add Rectangle');
    const json = store.lastCommandJson()!;
    store.undo();
    store.runCommand(JSON.parse(JSON.stringify(json)));
    const root = store.document().node({ asset: 'a.svg', id: 'n1' })!;
    expect(root.lastElementChild!.getAttribute('transform')).toBe(a['transform']);
  });

  it('arcs are paths with one arc; paint from the arguments wins', async () => {
    actions.run('sketch.arcCenter', {
      points: [
        [500, 500],
        [600, 500],
        [0, 0],
      ],
      values: { sweep: 90 },
      stroke: '#ff0000',
      strokeWidth: 5,
    });
    await flush();
    expect(node().localName).toBe('path');
    expect(attrs()['d']).toBe('M 600 500 A 100 100 0 0 0 500 400');
    expect(attrs()).toMatchObject({ stroke: '#ff0000', 'stroke-width': '5', fill: 'none' });
    expect(store.undoLabel()).toBe('Undo Add Arc');
    // remembered for the next arc, not for circles
    expect(TestBed.inject(StyleMemory).attrs('arc')['stroke']).toBe('#ff0000');
    expect(TestBed.inject(StyleMemory).attrs('circle')['stroke']).toBe('#000000');
  });

  it("a caller's transform goes in front of the shape's own rotation", async () => {
    actions.run('sketch.rect3p', {
      points: [
        [0, 0],
        [0, -100],
        [50, -50],
      ],
      transform: 'translate(5 6)',
    });
    await flush();
    expect(attrs()['transform']).toMatch(/^translate\(5 6\) rotate\(-90 /);
  });

  it('a line from two clicks; a circle from three points', async () => {
    actions.run('sketch.line', {
      points: [
        [10, 20],
        [110, 20],
      ],
    });
    await flush();
    expect(attrs()).toMatchObject({ x1: '10', y1: '20', x2: '110', y2: '20' });
    actions.run('sketch.circle3p', {
      points: [
        [0, 0],
        [100, 0],
        [50, 50],
      ],
    });
    await flush();
    expect(attrs()).toMatchObject({ cx: '50', cy: '0', r: '50' });
  });

  it('refuses malformed arguments and impossible shapes with a notice', async () => {
    const notice = () => TestBed.inject(FilesService).notice();
    const before = store.document().node({ asset: 'a.svg', id: 'n1' })!.children.length;
    actions.run('sketch.line', { points: [[0, 0]] });
    await flush();
    expect(notice()).toContain('could not be drawn');
    actions.run('sketch.circle3p', {
      points: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    });
    await flush();
    // a pick step without a canvas: nothing to pick
    actions.run('sketch.circle3t', {
      points: [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
      ],
    });
    await flush();
    expect(notice()).toContain('no edge');
    expect(store.document().node({ asset: 'a.svg', id: 'n1' })!.children.length).toBe(before);
    expect(parseSketchPoints([[1, 'a']])).toBeNull();
    expect(parseSketchPoints(Array.from({ length: 9 }, () => [0, 0]))).toBeNull();
    expect(parseSketchValues({ length: 1, bogus: 2 })).toBeNull();
    expect(parseSketchValues({ angle: Infinity })).toBeNull();
    expect(parseSketchValues({ radius: 5 })).toEqual({ radius: 5 });
  });
});
