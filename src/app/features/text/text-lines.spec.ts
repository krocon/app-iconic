import { commandFromJson } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { svgDocument } from '../../../testing/documents';
import { lineHeightOf, linesOf, newTextMarkup, textSetCommand } from './text-lines';

const doc = () =>
  svgDocument(
    '<text id="a" x="10" y="20" fill="red">Hello</text>' +
      '<text id="b" x="5" y="9"><tspan x="5" dy="0">One <tspan fill="blue">big</tspan></tspan>' +
      '<tspan x="5" dy="1.5em">Two</tspan></text>',
  );

const byId = (s: DocumentStore, id: string) =>
  s.document().assets.get('a.svg')!.svg!.root.querySelector(`[id="${id}"]`)!;

describe('text lines (prompt 075 E4)', () => {
  it('reads plain and tspan lines; a styled word stays in its line', () => {
    const s = new DocumentStore(doc());
    expect(linesOf(byId(s, 'a'))).toEqual(['Hello']);
    expect(linesOf(byId(s, 'b'))).toEqual(['One big', 'Two']);
    expect(lineHeightOf(byId(s, 'b'))).toBe('1.5em');
    expect(lineHeightOf(byId(s, 'a'))).toBe('1.2em');
  });

  it('one line stays setText (JSON there and back); several lines become tspans', () => {
    const s = new DocumentStore(doc());
    const ref = s.document().refOf(byId(s, 'a'))!;
    const one = textSetCommand(s.document(), ref, 'Hi')!;
    expect(one.toJSON()).toEqual({ type: 'setText', changes: [{ ref, text: 'Hi' }] });
    s.execute(commandFromJson(JSON.parse(JSON.stringify(one.toJSON()))));
    expect(byId(s, 'a').textContent).toBe('Hi');
    s.execute(textSetCommand(s.document(), ref, 'A\nB')!);
    const t = byId(s, 'a');
    expect(t.getAttribute('fill')).toBe('red');
    expect(
      [...t.children].map((c) => [c.getAttribute('x'), c.getAttribute('dy'), c.textContent]),
    ).toEqual([
      ['10', '0', 'A'],
      ['10', '1.2em', 'B'],
    ]);
    expect(s.undoLabel()).toBe('Undo Change Text');
    s.undo();
    expect(byId(s, 'a').textContent).toBe('Hi');
    expect(textSetCommand(s.document(), ref, 'Hi')).toBeNull();
  });

  it('keeps the line height of an edited tspan text; new text markup', () => {
    const s = new DocumentStore(doc());
    const ref = s.document().refOf(byId(s, 'b'))!;
    s.execute(textSetCommand(s.document(), ref, 'One\nTwo\nThree')!);
    expect([...byId(s, 'b').children].map((c) => c.getAttribute('dy'))).toEqual([
      '0',
      '1.5em',
      '1.5em',
    ]);
    expect(newTextMarkup(1, 2, 'x', { 'font-size': '10' })).toBe(
      '<text xmlns="http://www.w3.org/2000/svg" x="1" y="2" font-size="10">x</text>',
    );
    expect(newTextMarkup(1, 2, 'a\nb', {})).toContain('<tspan x="1" dy="1.2em">b</tspan>');
  });
});
