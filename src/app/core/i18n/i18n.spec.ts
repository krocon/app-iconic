// Übernommen aus editlicious src/app/core/i18n/i18n.spec.ts (Prompt 009), um den tiefen Proxy ergänzt.
import { computed } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { language, phrasebook, setLanguage, systemLanguage, translatable } from './i18n';

describe('i18n (design 015 E13)', () => {
  afterEach(() => setLanguage('en'));

  it('follows the language signal, functions included', () => {
    const t = translatable(
      'test.a',
      { hi: 'Hello', n: (k: number) => `${k} files`, sub: { x: 'X' } },
      { de: { hi: 'Hallo', n: (k: number) => `${k} Dateien`, sub: { x: 'Ix' } } },
    );
    const c = computed(() => t.hi);
    expect(c()).toBe('Hello');
    setLanguage('de');
    expect(language()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(c()).toBe('Hallo');
    expect(t.n(3)).toBe('3 Dateien');
    expect(t.sub.x).toBe('Ix');
  });

  it('a kept sub-object follows the language (deep proxy)', () => {
    const t = translatable(
      'test.deep',
      { a: { b: { c: 'C', f: (n: number) => `${n} x` } }, list: ['one', 'two'] },
      { de: { a: { b: { c: 'Ce', f: (n: number) => `${n} mal` } }, list: ['eins', 'zwei'] } },
    );
    const kept = t.a.b;
    const c = computed(() => kept.c);
    expect(c()).toBe('C');
    setLanguage('de');
    expect(c()).toBe('Ce');
    expect(kept.f(2)).toBe('2 mal');
    expect(t.list).toEqual(['eins', 'zwei']);
    expect(t.a.b).toBe(kept);
    expect(Object.keys(kept)).toEqual(['c', 'f']);
    expect(Object.entries(t.a.b)[0]).toEqual(['c', 'Ce']);
    expect(Object.hasOwn(t.a, 'b')).toBe(true);
  });

  it('falls back to English for a missing key', () => {
    const t = translatable('test.b', { a: 'A', b: 'B' }, { de: { a: 'Ä' } as never });
    setLanguage('de');
    expect(t.a).toBe('Ä');
    expect(t.b).toBe('B');
  });

  it('phrase books translate by the English text', () => {
    const tr = phrasebook('test.c', { de: { Red: 'Rot' } });
    expect(tr('Red')).toBe('Red');
    setLanguage('de');
    expect(tr('Red')).toBe('Rot');
    expect(tr('Blue')).toBe('Blue');
  });

  it('system language', () => {
    expect(systemLanguage(['de-AT', 'en'])).toBe('de');
    expect(systemLanguage(['de'])).toBe('de');
    expect(systemLanguage(['en-GB'])).toBe('en');
    expect(systemLanguage(['fr-FR'])).toBe('en');
    expect(systemLanguage([])).toBe('en');
  });
});
