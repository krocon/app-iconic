import { smallDocument } from '../../../../testing/documents';
import { RemoveNode, SetAttribute, SetIconJsonValue } from '../commands';
import { setLanguage } from '../../../core/i18n/i18n';
import { logUndoGrouping } from './undo-log';
import { UNDO_DEPTH, UndoService } from './undo.service';

const rect = { asset: 'a.svg', id: 'n3' };

describe('UndoService', () => {
  function setup() {
    const doc = smallDocument();
    let changes = 0;
    const undo = new UndoService(doc, () => changes++);
    const fill = () => doc.node(rect)?.getAttribute('fill');
    return { doc, undo, fill, changes: () => changes };
  }

  it('names the steps in the UI language – a switch renames them at once (design 015 E17)', () => {
    const { undo } = setup();
    undo.execute(new SetAttribute(rect, 'fill', 'blue', 'changeFill'));
    setLanguage('de');
    try {
      expect(undo.state().undoLabel).toBe('Widerrufen: Füllung ändern');
      undo.undo();
      expect(undo.state().redoLabel).toBe('Wiederholen: Füllung ändern');
      expect(undo.state().undoLabel).toBe('Widerrufen');
    } finally {
      setLanguage('en');
    }
    expect(undo.state().redoLabel).toBe('Redo Change Fill');
  });

  it('logs the grouping only while the debug flag is on (design 015 E16)', () => {
    const { undo } = setup();
    const lines: unknown[][] = [];
    const debug = console.debug;
    console.debug = (...a: unknown[]) => void lines.push(a);
    try {
      undo.begin('moveNode');
      undo.update(new SetAttribute(rect, 'x', '1', 'moveNode'));
      undo.commit();
      expect(lines).toEqual([]);
      logUndoGrouping.set(true);
      undo.begin('moveNode');
      undo.update(new SetAttribute(rect, 'x', '2', 'moveNode'));
      undo.update(new SetAttribute(rect, 'x', '3', 'moveNode'));
      undo.commit();
      expect(lines.map((l) => l[0])).toEqual([
        '[undo] gesture begins: moveNode',
        '[undo] gesture merges: moveNode',
        '[undo] gesture commits: moveNode',
      ]);
    } finally {
      console.debug = debug;
      logUndoGrouping.set(false);
    }
  });

  it('names the steps and moves between undo and redo', () => {
    const { undo, fill, changes } = setup();
    expect(undo.state()).toEqual({
      canUndo: false,
      canRedo: false,
      undoLabel: 'Undo',
      redoLabel: 'Redo',
      dirty: false,
    });
    undo.execute(new SetAttribute(rect, 'fill', 'blue', 'changeFill'));
    expect(fill()).toBe('blue');
    expect(undo.state().undoLabel).toBe('Undo Change Fill');
    expect(undo.state().dirty).toBe(true);
    expect(undo.undo()).toBe(true);
    expect(fill()).toBe('red');
    expect(undo.state()).toMatchObject({
      canRedo: true,
      redoLabel: 'Redo Change Fill',
      dirty: false,
    });
    expect(undo.redo()).toBe(true);
    expect(fill()).toBe('blue');
    expect(undo.redo()).toBe(false);
    expect(changes()).toBe(3);
  });

  it('a new step clears redo; a failing command leaves no step', () => {
    const { undo } = setup();
    undo.execute(new SetAttribute(rect, 'fill', 'blue'));
    undo.undo();
    undo.execute(new SetAttribute(rect, 'stroke', 'x'));
    expect(undo.state().canRedo).toBe(false);
    expect(() => undo.execute(new RemoveNode({ asset: 'a.svg', id: 'n99' }))).toThrow();
    expect(undo.state().undoLabel).toBe('Undo Change Attribute');
  });

  it('dirty follows the save point, also across undo/redo', () => {
    const { undo } = setup();
    undo.execute(new SetAttribute(rect, 'fill', 'a'));
    undo.markSaved();
    expect(undo.state().dirty).toBe(false);
    undo.execute(new SetAttribute(rect, 'fill', 'b'));
    expect(undo.state().dirty).toBe(true);
    undo.undo();
    expect(undo.state().dirty).toBe(false);
    undo.undo();
    expect(undo.state().dirty).toBe(true);
    undo.redo();
    expect(undo.state().dirty).toBe(false);
    // the save point leaves the redo stack: dirty until saved again
    undo.undo();
    undo.execute(new SetAttribute(rect, 'fill', 'c'));
    undo.undo();
    expect(undo.state().dirty).toBe(true);
  });

  it('a gesture becomes one step; merged updates undo to the start', () => {
    const { undo, fill } = setup();
    undo.begin('moveNode');
    for (const v of ['1', '2', '3']) undo.update(new SetAttribute(rect, 'fill', v));
    undo.update(new SetIconJsonValue(['fill'], 'x'));
    undo.update(new SetIconJsonValue(['fill'], 'y'));
    expect(undo.state().canUndo).toBe(false);
    undo.commit();
    expect(fill()).toBe('3');
    expect(undo.state().undoLabel).toBe('Undo Move Node');
    undo.undo();
    expect(fill()).toBe('red');
    expect(undo.state().canUndo).toBe(false);
    undo.redo();
    expect(fill()).toBe('3');
  });

  it('cancel takes the gesture back; an empty gesture adds nothing', () => {
    const { doc, undo, fill } = setup();
    const before = doc.snapshot();
    undo.begin('changeOpacity');
    undo.update(new SetAttribute(rect, 'fill', '1'));
    undo.execute(new SetAttribute(rect, 'opacity', '0.5'));
    expect(undo.inGesture).toBe(true);
    undo.cancel();
    expect(doc.snapshot()).toBe(before);
    expect(fill()).toBe('red');
    undo.begin('changeOpacity');
    undo.commit();
    expect(undo.state().canUndo).toBe(false);
  });

  it('undo during a gesture commits it first', () => {
    const { undo, fill } = setup();
    undo.begin('changeFill');
    undo.update(new SetAttribute(rect, 'fill', 'x', 'changeFill'));
    undo.undo();
    expect(fill()).toBe('red');
    expect(undo.state().redoLabel).toBe('Redo Change Fill');
  });

  it(`keeps at most ${UNDO_DEPTH} steps`, () => {
    const { undo } = setup();
    for (let i = 0; i < UNDO_DEPTH + 5; i++) undo.execute(new SetAttribute(rect, 'x', String(i)));
    let n = 0;
    while (undo.undo()) n++;
    expect(n).toBe(UNDO_DEPTH);
    expect(undo.state().dirty).toBe(true);
  });
});
