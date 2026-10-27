import { IconDocument } from '../icon-document';
import { DocumentStore } from '../document.store';
import { CommandError } from './command';
import { commandFromJson } from './registry';
import { SetAttributes } from './set-attributes';
import { SetText } from './set-text';

function textDocument(): IconDocument {
  return IconDocument.fromDto({
    path: null,
    name: null,
    format: 'bundle',
    iconJson: { groups: [{ layers: [{ 'image-name': 't.svg', name: 't' }] }] },
    assets: [
      {
        name: 't.svg',
        kind: 'svg',
        text:
          '<svg xmlns="http://www.w3.org/2000/svg"><text>Hi</text><text>A<tspan>B</tspan></text>' +
          '<text/><style>.a{}</style></svg>',
      },
    ],
    warnings: [],
  });
}

const t = (id: string) => ({ asset: 't.svg', id });

describe('SetText (design 009 E3)', () => {
  it('changes the text of several elements as one step; undo restores', () => {
    const store = new DocumentStore(textDocument());
    const before = store.document().snapshot();
    store.execute(
      new SetText([
        { ref: t('n2'), text: 'Hello' },
        { ref: t('n5'), text: 'x' },
      ]),
    );
    expect(store.document().node(t('n2'))!.textContent).toBe('Hello');
    expect(store.document().node(t('n5'))!.textContent).toBe('x');
    expect(store.undoLabel()).toBe('Undo Change Text');
    store.undo();
    expect(store.document().snapshot()).toBe(before);
  });

  it('typing is one command (merge) and refuses elements with child elements', () => {
    const store = new DocumentStore(textDocument());
    store.begin('changeText');
    for (const s of ['H', 'He', 'Hey']) store.update(new SetText([{ ref: t('n2'), text: s }]));
    store.commit();
    expect(store.lastCommandJson()).toEqual({
      type: 'setText',
      changes: [{ ref: t('n2'), text: 'Hey' }],
    });
    const before = store.document().snapshot();
    expect(() => store.execute(new SetText([{ ref: t('n3'), text: 'flat' }]))).toThrow(
      CommandError,
    );
    expect(store.document().snapshot()).toBe(before);
  });

  it('refuses the text of a style sheet (prompt 031)', () => {
    const doc = textDocument();
    const store = new DocumentStore(doc);
    const style = doc.assets.get('t.svg')!.svg!.root.querySelector('style')!;
    const ref = doc.refOf(style)!;
    expect(() =>
      store.execute(new SetText([{ ref, text: 'rect{fill:url(https://evil)}' }])),
    ).toThrow(CommandError);
    expect(style.textContent).toBe('.a{}');
  });

  it('JSON is checked strictly', () => {
    for (const bad of [
      { type: 'setText', changes: [] },
      { type: 'setText', changes: [{ ref: t('n2') }] },
      { type: 'setText', changes: [{ ref: t('n2'), text: 1 }] },
      { type: 'setText', changes: [{ ref: t('n2'), text: 'a', x: 1 }] },
      {
        type: 'setText',
        changes: [
          { ref: t('n2'), text: 'a' },
          { ref: t('n2'), text: 'b' },
        ],
      },
    ]) {
      expect(() => commandFromJson(bad), JSON.stringify(bad)).toThrow(CommandError);
    }
  });
});

describe('SetAttributes with null (design 009 E3)', () => {
  it('null removes the attribute; undo puts it back; JSON keeps null', () => {
    const store = new DocumentStore(textDocument());
    store.execute(new SetAttributes([{ ref: t('n2'), name: 'x', value: '5' }]));
    store.execute(
      commandFromJson({
        type: 'setAttributes',
        changes: [{ ref: t('n2'), name: 'x', value: null }],
        label: 'resetProperty',
      }),
    );
    expect(store.document().node(t('n2'))!.hasAttribute('x')).toBe(false);
    expect(store.lastCommandJson()).toEqual({
      type: 'setAttributes',
      changes: [{ ref: t('n2'), name: 'x', value: null }],
      label: 'resetProperty',
    });
    expect(store.undoLabel()).toBe('Undo Reset Property');
    store.undo();
    expect(store.document().node(t('n2'))!.getAttribute('x')).toBe('5');
  });
});
