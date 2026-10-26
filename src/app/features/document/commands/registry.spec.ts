import { CASES, commandDocument } from '../../../../testing/command-cases';
import { smallDocument } from '../../../../testing/documents';
import { DocumentStore } from '../document.store';
import { CommandError, SetAttribute, SetIconJsonValue } from './index';
import { COMMAND_TYPES, commandFromJson, MAX_COMPOSITE_DEPTH } from './registry';

/** Plain JSON, as it would come over the MCP bridge (design 005 E15). */
const wire = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe('command registry (serialisable commands, design 005 E15)', () => {
  it('has a test case for every registered command type', () => {
    const covered = new Set(CASES.map(([, make]) => make(commandDocument()).toJSON().type));
    expect([...covered].sort()).toEqual([...COMMAND_TYPES].sort());
  });

  it.each(CASES)('%s survives JSON there and back with the same result', (_name, make) => {
    const original = commandDocument();
    const copy = commandDocument();
    const cmd = make(original);
    const json = wire(cmd.toJSON());
    const again = commandFromJson(json);
    expect(wire(again.toJSON())).toEqual(json);
    const before = copy.snapshot();
    cmd.do(original);
    again.do(copy);
    expect(copy.snapshot()).toBe(original.snapshot());
    again.undo(copy);
    expect(copy.snapshot()).toBe(before);
  });

  it('a merged gesture is one serialisable command', () => {
    const store = new DocumentStore(smallDocument());
    const ref = { asset: 'a.svg', id: 'n3' };
    store.begin('changeFill');
    store.update(new SetAttribute(ref, 'fill', 'blue', 'changeFill'));
    store.update(new SetAttribute(ref, 'fill', 'green', 'changeFill'));
    store.commit();
    expect(store.lastCommandJson()).toEqual({
      type: 'setAttribute',
      ref,
      name: 'fill',
      value: 'green',
      label: 'changeFill',
    });
    const doc = smallDocument();
    const json = new SetIconJsonValue(['fill'], 'a');
    const next = new SetIconJsonValue(['fill'], 'b');
    json.do(doc);
    next.do(doc);
    expect(json.merge(next)).toBe(true);
    expect(json.toJSON()).toEqual({ type: 'setIconJsonValue', path: ['fill'], value: 'b' });
  });

  it('runs commands from JSON through the store (undoable)', () => {
    const store = new DocumentStore(smallDocument());
    store.runCommand({
      type: 'setAttribute',
      ref: { asset: 'a.svg', id: 'n3' },
      name: 'fill',
      value: 'blue',
    });
    expect(store.document().node({ asset: 'a.svg', id: 'n3' })!.getAttribute('fill')).toBe('blue');
    expect(store.undoLabel()).toBe('Undo Change Attribute');
    store.undo();
    expect(store.document().node({ asset: 'a.svg', id: 'n3' })!.getAttribute('fill')).toBe('red');
  });

  it('rejects hostile or malformed JSON before anything runs', () => {
    const ref = { asset: 'a.svg', id: 'n3' };
    let deep: unknown = { type: 'removeGroup', index: 0 };
    for (let i = 0; i <= MAX_COMPOSITE_DEPTH; i++) {
      deep = { type: 'composite', label: 'importSvg', commands: [deep] };
    }
    const bad: unknown[] = [
      null,
      42,
      'setAttribute',
      [],
      {},
      { type: 'nope' },
      { type: 'toString' },
      { type: '__proto__' },
      { type: 'setAttribute', ref, name: 'fill' },
      { type: 'setAttribute', ref, name: 'fill', value: 1 },
      { type: 'setAttribute', ref, name: 'onclick', value: 'x()' },
      { type: 'setAttribute', ref, name: 'data-ai-id', value: 'n1' },
      { type: 'setAttribute', ref, name: 'a b', value: 'x' },
      { type: 'setAttribute', ref, name: 'fill', value: 'x', extra: true },
      { type: 'setAttribute', ref, name: 'fill', value: 'x', label: 'undo' },
      { type: 'setAttribute', ref, name: 'fill', value: 'x', label: 'hasOwnProperty' },
      { type: 'setAttribute', ref: { asset: 'a.svg', id: '[x]' }, name: 'fill', value: 'x' },
      { type: 'setAttribute', ref: { asset: '', id: 'n1' }, name: 'fill', value: 'x' },
      { type: 'removeGroup', index: -1 },
      { type: 'removeGroup', index: 1.5 },
      { type: 'removeGroup', index: '0' },
      { type: 'setIconJsonValue', path: [] },
      { type: 'setIconJsonValue', path: ['__proto__', 'x'], value: 1 },
      { type: 'setIconJsonValue', path: ['groups', -1], value: 1 },
      { type: 'setIconJsonValue', path: ['fill'], value: 'x'.repeat(1 << 21) },
      { type: 'addGroup', group: [] },
      { type: 'addLayer', group: 0, layer: 'x' },
      { type: 'insertNode', parent: ref, markup: 'x'.repeat((16 << 20) + 1) },
      { type: 'composite', label: 'importSvg', commands: [] },
      { type: 'composite', commands: [{ type: 'removeGroup', index: 0 }] },
      deep,
    ];
    for (const json of bad) {
      expect(() => commandFromJson(json), JSON.stringify(json)?.slice(0, 80)).toThrow(CommandError);
    }
    const store = new DocumentStore(smallDocument());
    const before = store.document().snapshot();
    expect(() =>
      store.runCommand({
        type: 'setAttribute',
        ref: { asset: 'a.svg', id: 'n99' },
        name: 'fill',
        value: 'x',
      }),
    ).toThrow(CommandError);
    expect(store.document().snapshot()).toBe(before);
    expect(store.canUndo()).toBe(false);
  });
});
