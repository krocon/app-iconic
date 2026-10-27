import { smallDocument } from '../../../../testing/documents';
import { DocumentStore } from '../document.store';
import { CommandError } from './command';
import { commandFromJson } from './registry';
import { SetAttributes } from './set-attributes';

const r = (id: string) => ({ asset: 'a.svg', id });

describe('SetAttributes (design 007 E10)', () => {
  it('changes several attributes as one step; undo restores order and missing ones', () => {
    const store = new DocumentStore(smallDocument());
    const before = store.document().snapshot();
    store.execute(
      new SetAttributes([
        { ref: r('n3'), name: 'width', value: '20' },
        { ref: r('n3'), name: 'x', value: '5' },
        { ref: r('n4'), name: 'r', value: '9' },
      ]),
    );
    const rect = store.document().node(r('n3'))!;
    expect(rect.getAttribute('width')).toBe('20');
    expect(rect.getAttribute('x')).toBe('5');
    store.undo();
    expect(store.document().snapshot()).toBe(before);
    expect(rect.hasAttribute('x')).toBe(false);
  });

  it('a gesture of updates with the same targets is ONE command with the end values', () => {
    const store = new DocumentStore(smallDocument());
    store.begin('moveNode');
    for (const x of ['1', '2', '3']) {
      store.update(
        new SetAttributes(
          [
            { ref: r('n3'), name: 'x', value: x },
            { ref: r('n4'), name: 'cx', value: x },
          ],
          'moveNode',
        ),
      );
    }
    store.commit();
    expect(store.lastCommandJson()).toEqual({
      type: 'setAttributes',
      changes: [
        { ref: r('n3'), name: 'x', value: '3' },
        { ref: r('n4'), name: 'cx', value: '3' },
      ],
      label: 'moveNode',
    });
    expect(store.undoLabel()).toBe('Undo Move Node');
    store.undo();
    expect(store.document().node(r('n3'))!.hasAttribute('x')).toBe(false);
    expect(store.canUndo()).toBe(false);
  });

  it('does not merge other targets; refuses duplicates, handlers and hostile JSON', () => {
    const a = new SetAttributes([{ ref: r('n3'), name: 'x', value: '1' }]);
    expect(a.merge(new SetAttributes([{ ref: r('n4'), name: 'x', value: '1' }]))).toBe(false);
    expect(a.merge(new SetAttributes([{ ref: r('n3'), name: 'y', value: '1' }]))).toBe(false);
    expect(() => new SetAttributes([])).toThrow(CommandError);
    expect(
      () =>
        new SetAttributes([
          { ref: r('n3'), name: 'x', value: '1' },
          { ref: r('n3'), name: 'x', value: '2' },
        ]),
    ).toThrow(CommandError);
    expect(() => new SetAttributes([{ ref: r('n3'), name: 'onclick', value: 'x()' }])).toThrow();
    // values the import sanitizer would remove (prompt 031)
    for (const [name, value] of [
      ['href', 'javascript:alert(1)'],
      ['xlink:href', 'https://evil.example/x.svg#a'],
      ['fill', 'url(https://evil.example/p)'],
      ['style', 'fill:\\75 rl(//evil)'],
      ['xml:base', 'https://evil.example/'],
    ]) {
      expect(() => new SetAttributes([{ ref: r('n3'), name, value }])).toThrow(CommandError);
      expect(() => commandFromJson({ type: 'setAttribute', ref: r('n3'), name, value })).toThrow(
        CommandError,
      );
    }
    expect(
      () => new SetAttributes([{ ref: r('n3'), name: 'fill', value: 'url(#g)' }]),
    ).not.toThrow();
    expect(() => new SetAttributes([{ ref: r('n3'), name: 'href', value: '#g' }])).not.toThrow();
    for (const bad of [
      { type: 'setAttributes', changes: [] },
      { type: 'setAttributes', changes: [{ ref: r('n3'), name: 'x' }] },
      { type: 'setAttributes', changes: [{ ref: r('n3'), name: 'x', value: 1 }] },
      { type: 'setAttributes', changes: [{ ref: r('x'), name: 'x', value: '1' }] },
      { type: 'setAttributes', changes: [{ ref: r('n3'), name: 'x', value: '1', more: 1 }] },
      { type: 'setAttributes', changes: [{ ref: r('n3'), name: 'x', value: '1' }], label: 'nope' },
    ]) {
      expect(() => commandFromJson(bad)).toThrow(CommandError);
    }
  });

  it('a missing target changes nothing', () => {
    const doc = smallDocument();
    const before = doc.snapshot();
    const c = new SetAttributes([
      { ref: r('n3'), name: 'x', value: '1' },
      { ref: r('n99'), name: 'x', value: '1' },
    ]);
    expect(() => c.do(doc)).toThrow(CommandError);
    expect(doc.snapshot()).toBe(before);
  });
});

describe('DocumentStore.executeCoalescing (design 007 E12)', () => {
  const nudge = (x: string) =>
    new SetAttributes([{ ref: r('n3'), name: 'x', value: x }], 'moveNode');

  it('joins commands of one series within 500 ms into one undo step', () => {
    const store = new DocumentStore(smallDocument());
    store.executeCoalescing(nudge('1'), 'k', 500, 1000);
    store.executeCoalescing(nudge('2'), 'k', 500, 1400);
    store.executeCoalescing(nudge('3'), 'k', 500, 1800);
    expect(store.document().node(r('n3'))!.getAttribute('x')).toBe('3');
    store.undo();
    expect(store.document().node(r('n3'))!.hasAttribute('x')).toBe(false);
    expect(store.canUndo()).toBe(false);
  });

  it('a pause, another key or a command in between start a new step', () => {
    const store = new DocumentStore(smallDocument());
    store.executeCoalescing(nudge('1'), 'k', 500, 1000);
    store.executeCoalescing(nudge('2'), 'k', 500, 1600); // pause
    store.executeCoalescing(nudge('3'), 'other', 500, 1700); // other selection
    store.execute(new SetAttributes([{ ref: r('n4'), name: 'r', value: '1' }]));
    store.executeCoalescing(nudge('4'), 'other', 500, 1800); // something in between
    const x = () => store.document().node(r('n3'))!.getAttribute('x');
    store.undo();
    expect(x()).toBe('3');
    store.undo(); // r
    store.undo();
    expect(x()).toBe('2');
    store.undo();
    expect(x()).toBe('1');
  });

  it('never folds into the save point', () => {
    const store = new DocumentStore(smallDocument());
    store.executeCoalescing(nudge('1'), 'k', 500, 1000);
    store.markSaved({ path: '/a.icon', format: 'bundle', name: 'a.icon' });
    store.executeCoalescing(nudge('2'), 'k', 500, 1100);
    expect(store.dirty()).toBe(true);
    store.undo();
    expect(store.dirty()).toBe(false);
  });
});
