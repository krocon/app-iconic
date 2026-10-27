import { TestBed } from '@angular/core/testing';
import { camscannerDocument } from '../../../testing/documents';
import { fakeBackend } from '../../../testing/providers';
import { DocumentStore } from '../document/document.store';
import { CanvasView } from './canvas-view';
import { CanvasViewStore } from './canvas-view.store';
import { ActionService } from '../../core/actions/action.service';

describe('CanvasView', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: fakeBackend().providers }));

  async function render() {
    const fixture = TestBed.createComponent(CanvasView);
    const store = new DocumentStore(camscannerDocument());
    fixture.componentRef.setInput('store', store);
    await fixture.whenStable();
    return {
      fixture,
      el: fixture.nativeElement as HTMLElement,
      view: TestBed.inject(CanvasViewStore),
    };
  }

  it('shows layers, guides, rulers, the background and the squircle mask', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('.layer')).toHaveLength(2);
    expect(el.querySelectorAll('svg.host .guides circle')).toHaveLength(3);
    expect(el.querySelectorAll('app-canvas-ruler')).toHaveLength(2);
    expect(el.querySelector('app-canvas-background linearGradient')).not.toBeNull();
    expect(el.querySelector<HTMLElement>('.paper')!.style.clipPath).toMatch(/^path\(/);
    expect(el.querySelector('[data-testid="canvas-coords"]')!.textContent).toContain('X –');
    expect(el.querySelector('[data-testid="canvas-zoom"]')!.textContent).toBe('100 %');
  });

  it('follows the options', async () => {
    const { fixture, el, view } = await render();
    view.toggle('rulers');
    view.toggle('guides');
    view.toggle('background');
    view.set('mask', 'circle');
    await fixture.whenStable();
    expect(el.querySelectorAll('app-canvas-ruler')).toHaveLength(0);
    expect(el.querySelector('svg.host .guides')).toBeNull();
    expect(el.querySelector('app-canvas-background')).toBeNull();
    expect(el.querySelector('.paper')!.classList).toContain('transparent');
    expect(el.querySelector<HTMLElement>('.paper')!.style.clipPath).toBe('circle(50%)');
    view.set('mask', 'none');
    await fixture.whenStable();
    expect(el.querySelector<HTMLElement>('.paper')!.style.clipPath).toBe('');
  });

  it('toolbar buttons zoom and toggle (aria-pressed)', async () => {
    const { fixture, el, view } = await render();
    view.setViewport(800, 800);
    await fixture.whenStable();
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
      )!;
    button('Zoom In').click();
    await fixture.whenStable();
    expect(view.zoom()).toBe(0.75);
    expect(el.querySelector('[data-testid="canvas-zoom"]')!.textContent).toBe('75 %');
    const select = el.querySelector<HTMLSelectElement>('select[aria-label="Zoom level"]')!;
    expect(select.value).toBe('0.75');
    select.value = '1.5';
    select.dispatchEvent(new Event('change'));
    expect(view.zoom()).toBe(1.5);
    // View Options: a menu button with checkbox / radio items running the same actions (005 E10)
    const options = button('View Options ▾');
    expect(options.getAttribute('aria-expanded')).toBe('false');
    options.click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    const item = (label: string) =>
      [...el.querySelectorAll<HTMLElement>('[role="menu"] li[tabindex]')].find((li) =>
        li.textContent?.trim().endsWith(label),
      )!;
    expect(document.activeElement).toBe(item('Rulers'));
    const cross = item('Cross Cursor');
    expect(cross.getAttribute('role')).toBe('menuitemcheckbox');
    // on by default since design 015 E9 (legacy §9)
    expect(cross.getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('.viewport')!.classList).toContain('cross');
    cross.click();
    await fixture.whenStable();
    expect(item('Cross Cursor').getAttribute('aria-checked')).toBe('false');
    expect(el.querySelector('.viewport')!.classList).not.toContain('cross');
    expect(item('Magic Snap').getAttribute('aria-checked')).toBe('true');
    expect(item('Snap to Grid').getAttribute('aria-checked')).toBe('false');
    const watch = item('watchOS');
    expect(watch.getAttribute('role')).toBe('menuitemradio');
    watch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(view.options().mask).toBe('circle');
    item('watchOS').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(options);
  });

  it('registers its actions while it lives (zoom, toggles, zoomTo with arguments)', async () => {
    const { fixture, view } = await render();
    const actions = TestBed.inject(ActionService);
    view.setViewport(800, 800);
    expect(actions.run('view.zoomTo', { zoom: 1.25 })).toBe(true);
    expect(view.zoom()).toBe(1.25);
    expect(actions.run('view.zoomTo', { zoom: 9 })).toBe(false);
    expect(actions.run('view.zoomTo')).toBe(false);
    expect(actions.checked('view.rulers')).toBe(true);
    actions.run('view.rulers');
    expect(view.options().rulers).toBe(false);
    expect(actions.checked('view.appearance.dark')).toBe(view.options().appearance === 'dark');
    fixture.destroy();
    expect(actions.available('view.zoomIn')).toBe(false);
  });

  it('dark appearance switches the automatic background', async () => {
    const { fixture, el, view } = await render();
    view.set('appearance', 'light');
    await fixture.whenStable();
    const light = el.querySelector('app-canvas-background stop')!.getAttribute('style');
    view.set('appearance', 'dark');
    await fixture.whenStable();
    expect(el.querySelector('app-canvas-background stop')!.getAttribute('style')).not.toBe(light);
  });
});
