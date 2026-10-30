import { SCENES, sceneLayout } from './mockup-scenes';
import { escapeXml, fitName, sceneSvg, svgDataUrl, SceneInput } from './mockup-svg';

const ICON = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>');

function input(extra: Partial<SceneInput> = {}): SceneInput {
  return {
    layout: sceneLayout('homeLight'),
    appearance: 'light',
    icon: ICON,
    name: 'Camscanner',
    background: null,
    title: 'Camscanner in iOS Home Screen, Light',
    ...extra,
  };
}

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('scene SVG (prompt 081)', () => {
  it('has the scene size, its title and the icon at its slots', () => {
    const d = parse(sceneSvg(input()));
    const root = d.documentElement;
    expect(d.querySelector('parsererror')).toBeNull();
    expect([root.getAttribute('width'), root.getAttribute('height')]).toEqual(['360', '292']);
    expect(root.querySelector('title')!.textContent).toBe('Camscanner in iOS Home Screen, Light');
    const own = [...root.querySelectorAll('image[data-own]')];
    expect(own).toHaveLength(1);
    expect(own[0].getAttribute('href')).toBe(ICON);
    expect(own[0].getAttribute('width')).toBe('60');
    expect(root.querySelectorAll('[data-placeholder]')).toHaveLength(11);
    expect(root.querySelector('text')!.textContent).toBe('Camscanner');
  });

  it('references nothing outside: every href is a data URL, in every scene', () => {
    for (const s of SCENES) {
      for (const appearance of ['light', 'dark', 'tinted'] as const) {
        const text = sceneSvg(input({ layout: sceneLayout(s.id), appearance }));
        const d = parse(text);
        for (const el of d.querySelectorAll('*')) {
          for (const a of ['href', 'xlink:href', 'src']) {
            const v = el.getAttribute(a);
            if (v !== null) expect(v.startsWith('data:')).toBe(true);
          }
        }
        expect(text.replace('http://www.w3.org/2000/svg', '')).not.toMatch(
          /https?:|file:|url\((?!#)/,
        );
      }
    }
  });

  it('dark and light backdrops differ; placeholders follow the appearance', () => {
    const light = sceneSvg(input());
    const dark = sceneSvg(input({ layout: sceneLayout('homeDark'), appearance: 'dark' }));
    expect(light).toContain('#dbe7f5');
    expect(dark).toContain('#18202e');
    expect(dark).not.toContain('#dbe7f5');
    expect(sceneSvg(input({ appearance: 'tinted' }))).toContain('#9a9a9a');
  });

  it('an own background image replaces the gradient', () => {
    const bg = 'data:image/png;base64,iVBORw0KGgo=';
    const d = parse(sceneSvg(input({ background: { dataUrl: bg } })));
    expect(d.querySelector('linearGradient')).toBeNull();
    const img = d.querySelector('image:not([data-own])')!;
    expect(img.getAttribute('href')).toBe(bg);
    expect(img.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
  });

  it('without the icon only the scenery is drawn', () => {
    expect(sceneSvg(input({ icon: null }))).not.toContain('data-own');
  });

  it('names are escaped and cut to their room', () => {
    const d = parse(sceneSvg(input({ name: '<b> & "x"' })));
    expect(d.querySelector('text')!.textContent).toBe('<b> & "x"');
    expect(escapeXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;');
    expect(fitName('Short', 80, 11)).toBe('Short');
    const cut = fitName('A very long application name', 80, 11);
    expect(cut.endsWith('…')).toBe(true);
    expect([...cut].length).toBeLessThanOrEqual(Math.floor(80 / (11 * 0.56)));
  });

  it('data URLs carry UTF-8', () => {
    const url = svgDataUrl('<svg>ä€</svg>');
    const bytes = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe('<svg>ä€</svg>');
  });

  it('recently used icons take the placeholder slots in order (prompt 082 E10)', () => {
    const recent = ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'];
    const d = parse(sceneSvg(input({ neighbours: recent })));
    const shown = [...d.querySelectorAll('image[data-neighbour]')];
    expect(shown.map((i) => i.getAttribute('href'))).toEqual(recent);
    expect(shown[0].getAttribute('width')).toBe('60');
    // the others stay abstract placeholders; the own icon is untouched
    expect(d.querySelectorAll('[data-placeholder]')).toHaveLength(9);
    expect(d.querySelectorAll('image[data-own]')).toHaveLength(1);
    // the tinted scene stays grey
    const tinted = parse(sceneSvg(input({ neighbours: recent, appearance: 'tinted' })));
    expect(tinted.querySelectorAll('image[data-neighbour]')).toHaveLength(0);
  });
});
