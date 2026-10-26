import { expect, Page } from '@playwright/test';
import { openIcon, setView } from './canvas-helpers';

/** Helpers of the selection / handle tests (prompt 007, real layout in Chromium). */

export interface Pt {
  x: number;
  y: number;
}

export async function openFixture(page: Page, name: string): Promise<void> {
  await openIcon(page, `/fixtures/svg/${name.replace(/\.svg$/, '')}.icon`);
}

/** Waits until the canvas has measured the selection (two frames). */
export async function frames(page: Page, n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }
}

export async function view(page: Page, zoom: number, panX: number, panY: number): Promise<void> {
  await setView(page, zoom, panX, panY);
  await frames(page);
}

/** `data-ai-id` of the element with the SVG `id` (or a selector) in an asset. */
export function idOf(page: Page, asset: string, selector: string): Promise<string> {
  return page.evaluate(
    ([asset, selector]) => {
      const root = window.__appIconic!.store()!.document().assets.get(asset)!.svg!.root;
      const el = root.querySelector(selector);
      if (!el) throw new Error(`no ${selector}`);
      return el.getAttribute('data-ai-id')!;
    },
    [asset, selector],
  );
}

export async function select(page: Page, asset: string, ids: string[]): Promise<void> {
  const ok = await page.evaluate(
    ([asset, ids]) =>
      window.__appIconic!.run('edit.select', {
        nodes: (ids as string[]).map((id) => ({ asset, id })),
      }),
    [asset, ids] as const,
  );
  expect(ok).toBe(true);
  await frames(page);
}

/** Centres of the overlay handles (client px) by `data-handle` key. */
export function handles(page: Page): Promise<Record<string, Pt>> {
  return page.evaluate(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const h of document.querySelectorAll('[data-testid="selection-overlay"] [data-handle]')) {
      const r = h.getBoundingClientRect();
      out[h.getAttribute('data-handle')!] = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return out;
  });
}

/** Client position of a point in the user space of a node – the browser's screen CTM. */
export function screenOf(page: Page, asset: string, id: string, p: Pt): Promise<Pt> {
  return page.evaluate(
    ([asset, id, x, y]) => {
      const el = window
        .__appIconic!.store()!
        .document()
        .node({ asset, id: id as string });
      const m = (el as SVGGraphicsElement).getScreenCTM()!;
      const q = new DOMPoint(x as number, y as number).matrixTransform(m);
      return { x: q.x, y: q.y };
    },
    [asset, id, p.x, p.y] as const,
  );
}

/** Document position (host units) of a point in the user space of a node. */
export function docOf(page: Page, asset: string, id: string, p: Pt): Promise<Pt> {
  return page.evaluate(
    ([asset, id, x, y]) => {
      const m = window.__appIconic!.nodeToDocument(asset as string, id as string)!;
      const [a, b, c, d, e, f] = m;
      const px = x as number;
      const py = y as number;
      return { x: a * px + c * py + e, y: b * px + d * py + f };
    },
    [asset, id, p.x, p.y] as const,
  );
}

export function attr(page: Page, asset: string, id: string, name: string): Promise<string | null> {
  return page.evaluate(
    ([asset, id, name]) =>
      window.__appIconic!.store()!.document().node({ asset, id })?.getAttribute(name) ?? null,
    [asset, id, name],
  );
}

/** Drags with the mouse from `a` by (dx, dy) in `steps` moves (client px). */
export async function drag(page: Page, a: Pt, dx: number, dy: number, steps = 6): Promise<void> {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + dx, a.y + dy, { steps });
  await frames(page);
  await page.mouse.up();
  await frames(page);
}

export function close(a: Pt, b: Pt, tol = 0.5): void {
  expect(Math.abs(a.x - b.x), `x ${a.x} vs ${b.x}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(a.y - b.y), `y ${a.y} vs ${b.y}`).toBeLessThanOrEqual(tol);
}

/** Turns snapping on or off (state of the canvas store). */
export async function snapping(page: Page, magic: boolean, grid = false): Promise<void> {
  await page.evaluate(
    ([magic, grid]) => {
      const c = window.__appIconic!.canvas;
      c.set('magicSnap', magic);
      c.set('snapToGrid', grid);
    },
    [magic, grid],
  );
}

/** Inserts markup into the node `parent` (a document command, undoable). */
export async function insert(page: Page, asset: string, parent: string, markup: string) {
  const err = await page.evaluate(
    ([asset, parent, markup]) =>
      window.__appIconic!.runCommand({ type: 'insertNode', parent: { asset, id: parent }, markup }),
    [asset, parent, markup],
  );
  expect(err).toBeNull();
  await frames(page);
}

/** Zoom and pan so that the document point `p` is in the middle of the viewport. */
export async function centerOn(page: Page, zoom: number, p: Pt): Promise<void> {
  const vp = await page.evaluate(() => window.__appIconic!.canvas.viewport());
  await view(
    page,
    zoom,
    Math.round(vp.width / 2 - p.x * zoom),
    Math.round(vp.height / 2 - p.y * zoom),
  );
}
