import { IconDocument } from '../document/icon-document';
import { constructionCommand, stripConstruction } from '../construction/construction';
import { rotationAbout } from '../../shared/geometry/pattern';
import { linkedCloneCommand, patternCommand } from './pattern-copies';

function doc(body: string): IconDocument {
  return IconDocument.fromDto({
    path: null,
    name: null,
    format: 'bundle',
    iconJson: { groups: [{ layers: [{ 'image-name': 'a.svg', name: 'a' }] }] } as never,
    assets: [
      {
        name: 'a.svg',
        kind: 'svg',
        text: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${body}</svg>`,
      },
    ],
    warnings: [],
  });
}

const root = (d: IconDocument) => d.assets.get('a.svg')!.svg!.root;
const refOf = (d: IconDocument, sel: string) => d.refOf(root(d).querySelector(sel)!)!;

describe('pattern copies (prompt 049)', () => {
  it('copies after the original, placement in the parent space, unique ids, one undo step', () => {
    const d = doc(
      '<g transform="translate(100 0)"><rect id="r" width="10" height="10" transform="scale(2)"/></g><circle/>',
    );
    const plan = patternCommand(
      d,
      [refOf(d, '#r')],
      [rotationAbout({ x: 0, y: 0 }, 90), rotationAbout({ x: 0, y: 0 }, 180)],
      (p) =>
        p.localName === 'g'
          ? { a: 1, b: 0, c: 0, d: 1, e: 100, f: 0 }
          : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      'circularPattern',
    )!;
    plan.command.do(d);
    const rects = [...root(d).querySelectorAll('rect')];
    expect(rects.map((r) => r.id)).toEqual(['r', 'r-2', 'r-3']);
    // P⁻¹ · R · P with P = translate(100 0): rotate by 90° around the document origin
    expect(rects[1].getAttribute('transform')).toBe('matrix(0 1 -1 0 -100 100) scale(2)');
    expect(plan.selection().nodes).toHaveLength(2);
    plan.command.undo(d);
    expect(root(d).querySelectorAll('rect')).toHaveLength(1);
  });

  it('linked clone: a <use> after the original, an id for it if needed', () => {
    const d = doc('<circle r="5"/>');
    const plan = linkedCloneCommand(d, [refOf(d, 'circle')])!;
    plan.command.do(d);
    expect(root(d).querySelector('circle')!.id).toBe('circle-1');
    expect(root(d).querySelector('use')!.getAttribute('href')).toBe('#circle-1');
  });
});

describe('construction lines (prompt 049)', () => {
  it('toggles on (keeping the opacity) and off; the export copy loses them', () => {
    const d = doc('<line id="l" opacity="0.4"/><rect id="r"/><g id="g"/>');
    const on = constructionCommand(d, [refOf(d, '#l'), refOf(d, '#r'), refOf(d, '#g')])!;
    on.do(d);
    const l = root(d).querySelector('#l')!;
    expect([l.getAttribute('data-construction'), l.getAttribute('opacity')]).toEqual(['0.4', '0']);
    expect(root(d).querySelector('#g')!.hasAttribute('data-construction')).toBe(false);
    constructionCommand(d, [refOf(d, '#l'), refOf(d, '#r')])!.do(d);
    expect([l.hasAttribute('data-construction'), l.getAttribute('opacity')]).toEqual([
      false,
      '0.4',
    ]);
    expect(root(d).querySelector('#r')!.hasAttribute('opacity')).toBe(false);
    on.do(d);
    const copy = root(d).cloneNode(true) as Element;
    stripConstruction(copy);
    expect(copy.querySelectorAll('line, rect')).toHaveLength(0);
  });
});
