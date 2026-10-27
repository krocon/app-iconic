import { loadLucideData, LucideData, LucideProvider } from './lucide-provider';

const DATA: LucideData = {
  nodes: {
    heart: [['path', { d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676Z' }]],
    'circle-dot': [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['circle', { cx: '12', cy: '12', r: '1', fill: 'currentColor' }],
    ],
    evil: [['path', { d: 'M0 0', onclick: 'alert(1)' }]],
  },
  tags: { heart: ['love'], 'circle-dot': ['target'] },
};

describe('LucideProvider', () => {
  it('loads lazily once and searches names and tags', async () => {
    let calls = 0;
    const p = new LucideProvider(() => {
      calls++;
      return Promise.resolve(DATA);
    });
    expect(p.loaded).toBe(false);
    await Promise.all([p.load(), p.load()]);
    expect(calls).toBe(1);
    expect(p.search('', 10).total).toBe(3);
    expect(p.search('target', 10).items.map((s) => s.id)).toEqual(['circle-dot']);
    expect(p.search('circle dot', 10).items[0].name).toBe('circle dot');
  });

  it('toSvg: one group with the paint, every element a path, the weight as stroke width', async () => {
    const p = new LucideProvider(() => Promise.resolve(DATA));
    await p.load();
    const s = p.toSvg('circle-dot', { weight: 1.5 })!;
    expect(s.width).toBe(24);
    expect(s.group.attrs).toEqual({
      fill: 'none',
      stroke: '#000000',
      'stroke-width': '1.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    expect(s.group.children!.map((c) => c.tag)).toEqual(['path', 'path']);
    expect(s.group.children![1].attrs['fill']).toBe('#000000');
    expect(s.group.children![0].attrs['d']).toMatch(/^M2 12A10 10/);
    expect(s.markup).toContain('viewBox="0 0 24 24"');
    expect(p.toSvg('heart')!.group.attrs['stroke-width']).toBe('2');
  });

  it('drops event handlers and unknown ids', async () => {
    const p = new LucideProvider(() => Promise.resolve(DATA));
    await p.load();
    expect(p.toSvg('evil')!.markup).not.toContain('onclick');
    expect(p.toSvg('nope')).toBeNull();
    expect(p.toSvg('constructor')).toBeNull();
  });

  it('a failed load can be retried', async () => {
    let fail = true;
    const p = new LucideProvider(() =>
      fail ? Promise.reject(new Error('x')) : Promise.resolve(DATA),
    );
    await expect(p.load()).rejects.toThrow('x');
    fail = false;
    await p.load();
    expect(p.loaded).toBe(true);
  });
});

describe('the real Lucide data', () => {
  it('has well over a thousand icons that all become paths', async () => {
    const data = await loadLucideData();
    const p = new LucideProvider(() => Promise.resolve(data));
    await p.load();
    const all = p.search('', 10_000);
    expect(all.total).toBeGreaterThan(1000);
    for (const s of all.items) {
      const svg = p.toSvg(s.id)!;
      expect(svg.group.children!.length, s.id).toBe(data.nodes[s.id].length);
    }
    expect(p.search('heart', 5).items[0].id).toBe('heart');
  });
});
