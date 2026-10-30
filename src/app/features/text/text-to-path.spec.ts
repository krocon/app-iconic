import { TestBed } from '@angular/core/testing';
import { FAKE_FONTS } from '../../../testing/fake-font-api';
import { svgDocument } from '../../../testing/documents';
import { fakeBackend } from '../../../testing/providers';
import { OS } from '../../core/actions/platform';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { chooseFont, familyList, pathMarkupFor, weightOf } from './text-to-path';
import { TextToPathService } from './text-to-path.service';

describe('text to path (prompt 075 E5)', () => {
  it('chooses the installed family, the nearest weight and slant; generic = default', () => {
    expect(familyList(`"Fake Serif", 'X', sans-serif`)).toEqual(['Fake Serif', 'X', 'sans-serif']);
    expect(chooseFont(FAKE_FONTS, 'Nope, Fake Sans', 700, false).style?.id).toBe('FakeSans-Bold');
    expect(chooseFont(FAKE_FONTS, 'Fake Sans', 400, true).style?.id).toBe('FakeSans-Italic');
    expect(chooseFont(FAKE_FONTS, 'sans-serif', 400, false).style).not.toBeNull();
    expect(chooseFont(FAKE_FONTS, 'Helvetica Neue, Futura', 400, false)).toEqual({
      style: null,
      missing: 'Helvetica Neue',
    });
    expect(weightOf('bold')).toBe(700);
    expect(weightOf('300')).toBe(300);
  });

  it('the path keeps paint and transform, drops the text settings', () => {
    const doc = svgDocument(
      '<text id="t" x="1" y="2" fill="red" class="c" transform="rotate(5)" font-family="A" text-anchor="middle">Hi</text>',
    );
    const el = doc.assets.get('a.svg')!.svg!.root.querySelector('text')!;
    const m = pathMarkupFor(el, 'M0 0h1');
    expect(m).toContain('fill="red"');
    expect(m).toContain('transform="rotate(5)"');
    expect(m).toContain('class="c"');
    expect(m).not.toMatch(/font-family|text-anchor| x=| y=|data-ai-/);
  });

  it('every line one outline at its place, one undo step', async () => {
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    const store = new DocumentStore(
      svgDocument(
        '<text id="t" x="10" y="50" font-family="Fake Sans" font-size="20" fill="red">' +
          '<tspan x="10" dy="0">AB</tspan><tspan x="10" dy="24">C</tspan></text>',
      ),
    );
    TestBed.inject(FilesService).store.set(store);
    const root = store.document().assets.get('a.svg')!.svg!.root;
    store.select([store.document().refOf(root.querySelector('text')!)!]);
    expect(await TestBed.inject(TextToPathService).convert()).toBe(true);
    const path = root.querySelector('path')!;
    expect(root.querySelector('text')).toBeNull();
    expect(path.getAttribute('fill')).toBe('red');
    expect(backend.fonts.calls.map((c) => c.text)).toEqual(['AB', 'C']);
    expect(store.undoLabel()).toBe('Undo Convert Text to Path');
    store.undo();
    expect(root.querySelector('text')).not.toBeNull();
  });
});
