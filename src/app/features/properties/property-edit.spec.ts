import { DocumentStore } from '../document/document.store';
import { IconDocument } from '../document/icon-document';
import { panelModel } from './panel-model';
import {
  editChanges,
  isSet,
  labelFor,
  planEdit,
  PropertySession,
  resetCommand,
  setPropertyCommand,
} from './property-edit';
import { specFor } from './property-spec';
import { parseLength, readProperty, validValue } from './property-values';

/** svg n1 > rect n2 (style fill), rect n3, circle n4, text n5, text n6 > tspan n7, use n8. */
function doc(): IconDocument {
  return IconDocument.fromDto({
    path: null,
    name: null,
    format: 'bundle',
    iconJson: { groups: [{ layers: [{ 'image-name': 'p.svg', name: 'p' }] }] },
    assets: [
      {
        name: 'p.svg',
        kind: 'svg',
        text:
          '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
          '<rect width="100" height="50" fill="red" style="fill: blue; opacity: 0.5" data-x="k"/>' +
          '<rect width="20" height="20" rx="4" ry="2" fill="red"/>' +
          '<circle r="5" fill="red" stroke="#000"/>' +
          '<text x="1">Hi</text><text>A<tspan>B</tspan></text>' +
          '<use xlink:href="#a"/></svg>',
      },
    ],
    warnings: [],
  });
}

const p = (id: string) => ({ asset: 'p.svg', id });

describe('property values (design 009 E2)', () => {
  it('style before attribute, then computed / default', () => {
    const d = doc();
    const rect = d.node(p('n2'))!;
    const fill = specFor('rect').find((x) => x.name === 'fill')!;
    expect(readProperty(rect, fill)).toEqual({ value: 'blue', source: 'style' });
    expect(readProperty(d.node(p('n3'))!, fill)).toEqual({ value: 'red', source: 'attribute' });
    const miter = specFor('rect').find((x) => x.name === 'stroke-miterlimit')!;
    expect(readProperty(rect, miter)).toEqual({ value: '4', source: 'default' });
    const x = specFor('rect').find((d) => d.name === 'x')!;
    expect(readProperty(rect, x)).toEqual({ value: null, source: 'none' });
    const href = specFor('use').find((d) => d.name === 'href')!;
    expect(readProperty(d.node(p('n8'))!, href).value).toBe('#a');
  });

  it('lengths and validation', () => {
    expect(parseLength('12.5')).toEqual({ n: 12.5, unit: '' });
    expect(parseLength(' 50% ')).toEqual({ n: 50, unit: '%' });
    expect(parseLength('1e2px')).toEqual({ n: 100, unit: 'px' });
    expect(parseLength('1.')).toEqual({ n: 1, unit: '' });
    expect(parseLength('-')).toBeNull();
    expect(parseLength('')).toBeNull();
    const op = specFor('rect').find((d) => d.name === 'opacity')!;
    expect(validValue(op, '0.4')).toBe(true);
    expect(validValue(op, '40%')).toBe(false);
    expect(
      validValue(
        specFor('rect').find((d) => d.name === 'x')!,
        '40%',
      ),
    ).toBe(true);
  });
});

describe('writing properties (design 009 E3)', () => {
  it('writes the attribute and drops the style property in the same step', () => {
    const store = new DocumentStore(doc());
    const before = store.document().snapshot();
    store.execute(setPropertyCommand(store.document(), [p('n2')], 'fill', '#00FF00')!);
    const rect = store.document().node(p('n2'))!;
    expect(rect.getAttribute('fill')).toBe('#00FF00');
    expect(rect.getAttribute('style')).toBe('opacity: 0.5;');
    expect(rect.getAttribute('data-x')).toBe('k');
    expect(store.undoLabel()).toBe('Undo Change Fill');
    expect(store.lastCommandJson()).toEqual({
      type: 'setAttributes',
      changes: [
        { ref: p('n2'), name: 'fill', value: '#00FF00' },
        { ref: p('n2'), name: 'style', value: 'opacity: 0.5;' },
      ],
      label: 'changeFill',
    });
    store.undo();
    expect(store.document().snapshot()).toBe(before);
  });

  it('a multiple selection changes all nodes that have the property – one step', () => {
    const store = new DocumentStore(doc());
    store.execute(
      setPropertyCommand(store.document(), [p('n3'), p('n4'), p('n5')], 'stroke-width', '3')!,
    );
    for (const id of ['n3', 'n4', 'n5'])
      expect(store.document().node(p(id))!.getAttribute('stroke-width')).toBe('3');
    store.undo();
    expect(store.document().node(p('n3'))!.hasAttribute('stroke-width')).toBe(false);
    expect(store.canUndo()).toBe(false);
    // only nodes that have it: r is not a rect property
    const plan = planEdit(store.document(), [p('n3'), p('n4')], 'r');
    expect(plan.nodes.map((n) => n.ref.id)).toEqual(['n4']);
  });

  it('xlink:href stays xlink:href; text content via setText', () => {
    const store = new DocumentStore(doc());
    store.execute(setPropertyCommand(store.document(), [p('n8')], 'href', '#b')!);
    expect(store.lastCommandJson()).toMatchObject({
      changes: [{ name: 'xlink:href', value: '#b' }],
    });
    store.execute(setPropertyCommand(store.document(), [p('n5')], 'text', 'Hello')!);
    expect(store.document().node(p('n5'))!.textContent).toBe('Hello');
    expect(store.lastCommandJson()).toEqual({
      type: 'setText',
      changes: [{ ref: p('n5'), text: 'Hello' }],
    });
    expect(labelFor('text')).toBe('changeText');
    expect(labelFor('x')).toBe('changeAttribute');
  });

  it('constrain proportions: the partner follows in the ratio before the edit (design 009 E6)', () => {
    const d = doc();
    const plan = planEdit(d, [p('n2'), p('n3')], 'width');
    expect(editChanges(plan, '200', true)).toEqual([
      { ref: p('n2'), name: 'width', value: '200' },
      { ref: p('n2'), name: 'height', value: '100' },
      { ref: p('n3'), name: 'width', value: '200' },
      { ref: p('n3'), name: 'height', value: '200' },
    ]);
    expect(editChanges(planEdit(d, [p('n3')], 'ry'), '4', true)).toEqual([
      { ref: p('n3'), name: 'ry', value: '4' },
      { ref: p('n3'), name: 'rx', value: '8' },
    ]);
    // no partner value: nothing follows
    expect(editChanges(planEdit(d, [p('n2')], 'rx'), '4', true)).toHaveLength(1);
    expect(editChanges(plan, '200', false)).toHaveLength(2);
  });
});

describe('typed values are one gesture (design 009 E4)', () => {
  it('every keystroke updates; commit leaves ONE setAttributes; cancel restores', () => {
    const store = new DocumentStore(doc());
    const s = new PropertySession(store, [p('n2')], 'opacity');
    for (const v of ['0', '0.', '0.2', '0.25']) s.edit(v);
    expect(store.document().node(p('n2'))!.getAttribute('opacity')).toBe('0.25');
    s.commit();
    expect(store.lastCommandJson()).toEqual({
      type: 'setAttributes',
      changes: [
        { ref: p('n2'), name: 'opacity', value: '0.25' },
        { ref: p('n2'), name: 'style', value: 'fill: blue;' },
      ],
      label: 'changeOpacity',
    });
    expect(store.undoLabel()).toBe('Undo Change Opacity');
    store.undo();
    expect(store.canUndo()).toBe(false);

    const before = store.document().snapshot();
    const c = new PropertySession(store, [p('n3')], 'width');
    c.edit('30', true);
    c.edit('40', true);
    expect(store.document().node(p('n3'))!.getAttribute('height')).toBe('40');
    c.cancel();
    expect(store.document().snapshot()).toBe(before);
    expect(store.inGesture).toBe(false);
  });

  it('a session without targets does nothing', () => {
    const store = new DocumentStore(doc());
    const s = new PropertySession(store, [p('n2')], 'r');
    expect(s.edit('3')).toBe(false);
    s.commit();
    expect(store.canUndo()).toBe(false);
  });
});

describe('reset (design 009 E8)', () => {
  it('removes attribute and style property; geometry that would vanish is kept', () => {
    const store = new DocumentStore(doc());
    const before = store.document().snapshot();
    store.execute(resetCommand(store.document(), [p('n2')], ['fill'])!);
    const rect = store.document().node(p('n2'))!;
    expect(rect.hasAttribute('fill')).toBe(false);
    expect(rect.getAttribute('style')).toBe('opacity: 0.5;');
    expect(store.undoLabel()).toBe('Undo Reset Property');
    store.undo();
    expect(store.document().snapshot()).toBe(before);
    expect(resetCommand(store.document(), [p('n2')], ['width'])).toBeNull();
    expect(resetCommand(store.document(), [p('n2')], ['stroke'])).toBeNull();
  });

  it('Reset All removes every resettable property of the selection – one step', () => {
    const store = new DocumentStore(doc());
    store.execute(resetCommand(store.document(), [p('n2'), p('n4')], 'all', 'resetAllProperties')!);
    const rect = store.document().node(p('n2'))!;
    expect(rect.hasAttribute('style')).toBe(false);
    expect(rect.hasAttribute('fill')).toBe(false);
    expect(rect.getAttribute('width')).toBe('100');
    expect(rect.getAttribute('data-x')).toBe('k');
    const circle = store.document().node(p('n4'))!;
    expect(circle.hasAttribute('stroke')).toBe(false);
    expect(circle.getAttribute('r')).toBe('5');
    expect(store.undoLabel()).toBe('Undo Reset All Properties');
    expect(isSet(rect, 'fill')).toBe(false);
  });
});

describe('panel model (design 009 E5, E9)', () => {
  it('single selection: values by section, reset only where set', () => {
    const m = panelModel(doc(), [p('n3')])!;
    expect(m.kind).toBe('rect');
    expect(m.sections.map((s) => s.section)).toEqual([
      'geometry',
      'appearance',
      'stroke',
      'transform',
      'advanced',
    ]);
    const rows = m.sections.flatMap((s) => s.rows);
    const fill = rows.find((r) => r.def.name === 'fill')!;
    expect(fill.value).toEqual({ kind: 'same', value: 'red' });
    expect(fill.set).toBe(true);
    const op = rows.find((r) => r.def.name === 'opacity')!;
    expect(op).toMatchObject({ value: { kind: 'same', value: null }, fallback: '1', set: false });
  });

  it('multiple selection: common properties, mixed values', () => {
    const m = panelModel(doc(), [p('n2'), p('n3'), p('n4')])!;
    expect(m.kind).toBe('multiple');
    expect(m.count).toBe(3);
    const rows = m.sections.flatMap((s) => s.rows);
    expect(rows.find((r) => r.def.name === 'width')).toBeUndefined();
    expect(rows.find((r) => r.def.name === 'fill')!.value).toEqual({ kind: 'mixed' });
    expect(panelModel(doc(), [])).toBeNull();
  });

  it('text with tspans is not editable', () => {
    const rows = panelModel(doc(), [p('n6')])!.sections.flatMap((s) => s.rows);
    expect(rows.find((r) => r.def.name === 'text')!.editable).toBe(false);
    const own = panelModel(doc(), [p('n5')])!.sections.flatMap((s) => s.rows);
    expect(own.find((r) => r.def.name === 'text')!).toMatchObject({
      editable: true,
      value: { kind: 'same', value: 'Hi' },
    });
  });
});
