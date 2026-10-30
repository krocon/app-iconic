import { svgDocument } from '../../../testing/documents';
import { commandFromJson } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import {
  defaultEffect,
  effectsCommand,
  filterMarkup,
  filterOf,
  filterState,
  readEffects,
} from './effect-model';
import { createMaskCommand, maskOf, maskTypeCommand, releaseMaskCommand } from './mask-model';

const by = (s: DocumentStore, id: string) =>
  s.document().assets.get('a.svg')!.svg!.root.querySelector(`[id="${id}"]`)!;
const ref = (s: DocumentStore, id: string) => s.document().refOf(by(s, id))!;
const root = (s: DocumentStore) => s.document().assets.get('a.svg')!.svg!.root;

describe('effects (prompt 076 E1)', () => {
  it('writes a managed filter and reads it back', () => {
    const shadow = { ...defaultEffect('dropShadow'), dx: 3 };
    const m = filterMarkup('f', [shadow, defaultEffect('blur')]);
    expect(m).toContain('<feGaussianBlur in="SourceGraphic"');
    expect(m).toContain('<feDropShadow in="fx-blur" dx="3"');
    const el = new DOMParser().parseFromString(m, 'image/svg+xml').documentElement;
    expect(readEffects(el)).toEqual([shadow, defaultEffect('blur')]);
    // all off: the graphic passes through
    expect(filterMarkup('f', [{ ...shadow, on: false }])).toContain('<feOffset in="SourceGraphic"');
  });

  it('adds, updates in place, removes – one step each; JSON there and back', () => {
    const s = new DocumentStore(svgDocument('<rect id="r" width="10" height="10"/>'));
    const before = s.document().snapshot();
    const add = effectsCommand(s.document(), ref(s, 'r'), [defaultEffect('dropShadow')])!;
    s.execute(commandFromJson(JSON.parse(JSON.stringify(add.toJSON()))));
    expect(by(s, 'r').getAttribute('filter')).toBe('url(#effects-1)');
    expect(s.undoLabel()).toBe('Undo Change Effects');
    const next = [{ ...defaultEffect('dropShadow'), dy: 20 }];
    s.execute(effectsCommand(s.document(), ref(s, 'r'), next)!);
    expect(root(s).querySelectorAll('filter')).toHaveLength(1);
    expect(readEffects(filterOf(by(s, 'r'), root(s))!)).toEqual(next);
    s.execute(effectsCommand(s.document(), ref(s, 'r'), [])!);
    expect(by(s, 'r').hasAttribute('filter')).toBe(false);
    expect(root(s).querySelector('filter')).toBeNull();
    s.undo();
    s.undo();
    s.undo();
    expect(s.document().snapshot()).toBe(before);
  });

  it('a shared filter is copied on change; a foreign one stays untouched', () => {
    const managed = filterMarkup('fx', [defaultEffect('blur')]).replace(/ xmlns="[^"]+"/, '');
    const s = new DocumentStore(
      svgDocument(
        `<defs>${managed}<filter id="own"><feFlood/></filter></defs>` +
          '<rect id="a" filter="url(#fx)"/><rect id="b" filter="url(#fx)"/><rect id="c" filter="url(#own)"/>',
      ),
    );
    expect(filterState(by(s, 'a'), root(s))).toMatchObject({ kind: 'managed', shared: true });
    s.execute(effectsCommand(s.document(), ref(s, 'a'), [defaultEffect('dropShadow')])!);
    expect(by(s, 'a').getAttribute('filter')).toBe('url(#effects-1)');
    expect(by(s, 'b').getAttribute('filter')).toBe('url(#fx)');
    expect(filterState(by(s, 'c'), root(s))).toEqual({ kind: 'foreign' });
    expect(effectsCommand(s.document(), ref(s, 'c'), [defaultEffect('blur')])).toBeNull();
    expect(root(s).querySelector('#own')!.innerHTML).toContain('feFlood');
  });
});

describe('masks (prompt 076 E2)', () => {
  it('the front-most becomes the mask of a group of the others; type; release; undo', () => {
    const s = new DocumentStore(
      svgDocument(
        '<rect id="a" width="50" height="50" fill="red"/><circle id="m" r="20" fill="white"/>',
      ),
    );
    const before = s.document().snapshot();
    const cmd = createMaskCommand(s.document(), [ref(s, 'm'), ref(s, 'a')])!;
    s.execute(commandFromJson(JSON.parse(JSON.stringify(cmd.toJSON()))));
    const g = root(s).querySelector('g[mask]')!;
    expect(g.getAttribute('mask')).toBe('url(#mask-1)');
    expect(g.querySelector('[id="a"]')).not.toBeNull();
    const mask = maskOf(g, root(s))!;
    expect(mask.querySelector('[id="m"]')).not.toBeNull();
    expect(s.undoLabel()).toBe('Undo Create Mask');
    const gRef = s.document().refOf(g)!;
    s.execute(maskTypeCommand(s.document(), gRef, 'alpha')!);
    expect(mask.getAttribute('mask-type')).toBe('alpha');
    s.execute(releaseMaskCommand(s.document(), gRef)!);
    expect(g.hasAttribute('mask')).toBe(false);
    expect(root(s).querySelector('mask')).toBeNull();
    expect(root(s).querySelector('circle[id="m"]')).not.toBeNull();
    s.undo();
    s.undo();
    s.undo();
    expect(s.document().snapshot()).toBe(before);
    expect(createMaskCommand(s.document(), [ref(s, 'a')])).toBeNull();
  });
});

describe('effects and masks go along (prompt 076)', () => {
  it('duplicate copies the filter and the mask, copy takes them as defs', async () => {
    const { duplicateClips, clipDefsMarkup } = await import('../clip/clip-references');
    const s = new DocumentStore(
      svgDocument(
        `<defs>${filterMarkup('fx', [defaultEffect('blur')]).replace(/ xmlns="[^"]+"/, '')}` +
          '<mask id="mk"><rect width="5" height="5" fill="white"/></mask></defs>' +
          '<rect id="r" filter="url(#fx)" mask="url(#mk)"/>',
      ),
    );
    const el = by(s, 'r');
    const copy = el.cloneNode(true) as Element;
    const taken = new Set(['fx', 'mk', 'r']);
    const defs = duplicateClips(el, copy, root(s), taken);
    expect(defs.join('')).toMatch(/<filter[^>]*id="fx-2"/);
    expect(defs.join('')).toMatch(/<mask[^>]*id="mk-2"/);
    expect(copy.getAttribute('filter')).toBe('url(#fx-2)');
    expect(copy.getAttribute('mask')).toBe('url(#mk-2)');
    expect(clipDefsMarkup([el], root(s), (e) => e.localName)).toBe('<defs>filtermask</defs>');
  });
});
