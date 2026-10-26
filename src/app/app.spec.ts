import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { fakeBackend } from '../testing/providers';
import { FakeIconFileApi } from '../testing/fake-icon-file-api';

describe('App', () => {
  let backend: ReturnType<typeof fakeBackend>;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({ imports: [App], providers: backend.providers });
  });

  async function app(start: string | null = null) {
    backend.window.start = start;
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the three panels and the canvas', async () => {
    const { el } = await app();
    const regions = [...el.querySelectorAll('[role="region"]')].map((r) =>
      r.getAttribute('aria-label'),
    );
    expect(regions).toEqual(['Commands', 'Hierarchy', 'Properties']);
    expect(el.querySelectorAll('app-canvas-view .guides circle')).toHaveLength(3);
    expect(el.querySelector('[data-testid="doc-title"]')?.textContent).toContain('Untitled');
  });

  it('opens the About dialog with the version from the backend', async () => {
    const { fixture, el } = await app();
    el.querySelector<HTMLButtonElement>('button.about')!.click();
    await fixture.whenStable();
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('0.0.0-test');
  });

  it('shows groups, layers and assets of the open document and stacks the layers', async () => {
    const { el } = await app(FakeIconFileApi.CAMSCANNER);
    const hierarchy = el.querySelector('app-hierarchy-list')!.textContent!;
    expect(hierarchy).toContain('Group 1');
    expect(hierarchy).toContain('logo-scanner 3');
    expect(hierarchy).toContain('opacity 1');
    const layers = [...el.querySelectorAll<HTMLElement>('app-canvas-view .layer')];
    expect(layers.map((l) => l.dataset['asset'])).toEqual([
      'logo-scanner 3.svg',
      'logo-scanner-2 2.svg',
    ]);
    expect(layers[0].shadowRoot!.querySelector('svg polygon')).not.toBeNull();
  });

  it('undo and redo buttons follow the document', async () => {
    const { fixture, el } = await app(FakeIconFileApi.CAMSCANNER);
    const undo = el.querySelector<HTMLButtonElement>('button.undo')!;
    expect(undo.disabled).toBe(true);
    backend.files.svgFiles.set('/a.svg', {
      name: 'a.svg',
      text: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    backend.files.picks.push('/a.svg');
    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Import'))!
      .click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(undo.disabled).toBe(false);
    expect(undo.getAttribute('aria-label')).toBe('Undo Import SVG');
    expect(el.querySelector('[data-testid="doc-title"]')?.textContent).toContain('Edited');
    undo.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLButtonElement>('button.redo')!.disabled).toBe(false);
    expect(el.querySelectorAll('app-canvas-view .layer')).toHaveLength(2);
  });
});
