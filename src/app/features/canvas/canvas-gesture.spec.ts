import { smallDocument } from '../../../testing/documents';
import { SetAttributes } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { DragOp, GestureController } from './canvas-gesture';

const ref = { asset: 'a.svg', id: 'n3' };
const noMods = { altKey: false, shiftKey: false, metaKey: false, ctrlKey: false };
const at = (clientX: number, clientY = 0) => ({ pointerId: 1, clientX, clientY, ...noMods });

/** A controller with a manual frame queue. */
function setup() {
  const frames: (() => void)[] = [];
  const g = new GestureController(
    (fn) => frames.push(fn),
    () => frames.splice(0),
  );
  const store = new DocumentStore(smallDocument());
  const ends: boolean[] = [];
  let clicks = 0;
  let updates = 0;
  const op: DragOp = {
    label: 'moveNode',
    update: (p) => {
      updates++;
      return new SetAttributes([{ ref, name: 'x', value: String(p.x) }], 'moveNode');
    },
    click: () => clicks++,
    end: (c) => ends.push(c),
  };
  const x = () => store.document().node(ref)!.getAttribute('x');
  const flush = () => frames.splice(0).forEach((f) => f());
  return { g, store, op, ends, x, flush, clicks: () => clicks, updates: () => updates };
}

const toDoc = (c: { clientX: number }) => ({ x: c.clientX, y: 0 });

describe('GestureController (design 007 E9)', () => {
  it('begin after 3 px, one update per frame, commit as ONE undo step', () => {
    const t = setup();
    t.g.start(t.op, t.store, at(0), toDoc);
    t.g.move(at(2));
    expect(t.g.dragging).toBe(false);
    t.g.move(at(5));
    t.g.move(at(8));
    t.g.move(at(12));
    expect(t.updates()).toBe(0); // throttled to the frame
    t.flush();
    expect(t.updates()).toBe(1);
    expect(t.x()).toBe('12');
    t.g.move(at(20));
    t.g.up(at(20));
    expect(t.x()).toBe('20');
    expect(t.ends).toEqual([true]);
    expect(t.store.lastCommandJson()).toEqual({
      type: 'setAttributes',
      changes: [{ ref, name: 'x', value: '20' }],
      label: 'moveNode',
    });
    t.store.undo();
    expect(t.x()).toBeNull();
    expect(t.store.canUndo()).toBe(false);
  });

  it('cancel (Escape) restores the start state and leaves no step', () => {
    const t = setup();
    t.g.start(t.op, t.store, at(0), toDoc);
    t.g.move(at(30));
    t.flush();
    expect(t.x()).toBe('30');
    expect(t.g.cancel()).toBe(true);
    expect(t.x()).toBeNull();
    expect(t.store.canUndo()).toBe(false);
    expect(t.ends).toEqual([false]);
    t.g.up(at(30)); // the release after Escape does nothing
    expect(t.store.canUndo()).toBe(false);
    expect(t.g.cancel()).toBe(false);
  });

  it('a press without movement is a click; other pointers are ignored', () => {
    const t = setup();
    t.g.start(t.op, t.store, at(0), toDoc);
    t.g.move({ ...at(50), pointerId: 2 });
    t.g.move(at(1));
    t.g.up(at(1));
    expect(t.clicks()).toBe(1);
    expect(t.updates()).toBe(0);
    expect(t.store.canUndo()).toBe(false);
    expect(t.g.busy).toBe(false);
  });

  it('a drag without label (marquee) changes no document', () => {
    const t = setup();
    const seen: number[] = [];
    t.g.start({ update: (p) => (seen.push(p.x), null) }, t.store, at(0), toDoc);
    t.g.move(at(10));
    t.flush();
    t.g.up(at(10));
    expect(seen).toEqual([10]);
    expect(t.store.canUndo()).toBe(false);
  });
});
