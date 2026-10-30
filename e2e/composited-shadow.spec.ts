import { expect, Page, test } from '@playwright/test';
import { openIcon } from './canvas-helpers';
import { frames } from './selection-helpers';

/**
 * Prompt 033 E5: the group shadow on the canvas is a composited CSS filter on the layer's box
 * (fast while dragging) – it must look like the SVG filter on the content it replaces, also for a
 * scaled layer (the shadow scales with the layer like before and like the export).
 */

/** The layers of the artboard as RGBA pixels. */
async function pixels(page: Page): Promise<number[]> {
  const shot = await page.locator('.layers').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(0, 0, c.width, c.height).data];
  }, shot.toString('base64'));
}

/** Back to the SVG filter on the content (the way before 033) in every layer. */
async function svgFilterOnContent(page: Page): Promise<number> {
  return page.evaluate(() => {
    let n = 0;
    for (const layer of document.querySelectorAll<HTMLElement>('.layer')) {
      const host = layer.shadowRoot!.querySelector<SVGSVGElement>('svg.layer-host')!;
      const filter = host.querySelector('filter');
      if (!filter) continue;
      const g = host.querySelector(':scope > g') as SVGGElement;
      const s = g.transform.baseVal.consolidate()?.matrix.a ?? 1;
      filter.removeAttribute('primitiveUnits');
      for (const p of filter.querySelectorAll('feDropShadow, feGaussianBlur, feOffset')) {
        for (const a of ['dy', 'stdDeviation']) {
          const v = p.getAttribute(a);
          if (v !== null) p.setAttribute(a, String((Number(v) * 1024) / s));
        }
      }
      host.style.filter = '';
      g.setAttribute('filter', `url(#${filter.id})`);
      n++;
    }
    return n;
  });
}

function difference(a: number[], b: number[]): { max: number; share: number } {
  let max = 0;
  let off = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    max = Math.max(max, d);
    if (d > 8) off++;
  }
  return { max, share: off / a.length };
}

for (const scale of [1, 0.6]) {
  test(`the composited canvas shadow looks like the SVG filter (layer scale ${scale})`, async ({
    page,
  }) => {
    await openIcon(page);
    // only the shadow: the glass approximation (prompt 077 E6) chains a filter of its own
    for (const group of [0, 1]) {
      await page.evaluate(
        (g) => window.__appIconic!.run('icon.set', { group: g, field: 'specular', value: false }),
        group,
      );
    }
    if (scale !== 1) {
      const ok = await page.evaluate(
        (s) =>
          window.__appIconic!.run('icon.set', {
            group: 0,
            layer: 0,
            field: 'position.scale',
            value: s,
          }),
        scale,
      );
      expect(ok).toBe(true);
    }
    await frames(page, 3);
    const hosts = await page.evaluate(() =>
      [...document.querySelectorAll('.layer')].map((l) => {
        const host = l.shadowRoot!.querySelector<SVGSVGElement>('svg.layer-host')!;
        return {
          filter: host.style.filter,
          transform: host.querySelector(':scope > g')!.getAttribute('transform'),
        };
      }),
    );
    expect(hosts.every((h) => h.filter.includes('ai-fx-shadow'))).toBe(true);
    // the scaled layer really is scaled (the shadow has to follow)
    expect(hosts.some((h) => (h.transform ?? '').includes(`scale(${scale})`))).toBe(scale !== 1);
    const composited = await pixels(page);
    expect(await svgFilterOnContent(page)).toBeGreaterThan(0);
    await frames(page, 3);
    const svg = await pixels(page);
    const d = difference(composited, svg);
    // the same pixels (Chromium: identical); a shadow 40 % off differs by 25 levels on 0.7 %
    expect(d.max).toBeLessThanOrEqual(8);
    expect(d.share).toBeLessThan(0.001);
  });
}
