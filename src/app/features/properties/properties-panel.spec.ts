import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { AskService } from '../../shared/ask/ask.service';
import { DocumentStore } from '../document/document.store';
import { IconDocument } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { registerPropertiesActions } from './properties-actions';
import { PropertiesPanel } from './properties-panel';
import { PropertiesService } from './properties.service';

/** svg n1 > rect n2, rect n3 (other fill), text n4. */
function doc(): IconDocument {
  return IconDocument.fromDto({
    path: null,
    name: null,
    format: 'bundle',
    iconJson: { groups: [{ layers: [{ 'image-name': 'q.svg', name: 'q' }] }] },
    assets: [
      {
        name: 'q.svg',
        kind: 'svg',
        text:
          '<svg xmlns="http://www.w3.org/2000/svg">' +
          '<rect width="10" height="20" fill="red"/><rect width="5" height="5" fill="blue"/>' +
          '<text font-size="20">Hi</text></svg>',
      },
    ],
    warnings: [],
  });
}

const q = (id: string) => ({ asset: 'q.svg', id });

describe('PropertiesPanel (design 009 E9)', () => {
  let store: DocumentStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(doc());
    TestBed.inject(FilesService).store.set(store);
    registerPropertiesActions(TestBed.inject(ActionService), TestBed.inject(PropertiesService));
  });

  async function render() {
    const fixture = TestBed.createComponent(PropertiesPanel);
    fixture.componentRef.setInput('store', store);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const field = (name: string) => el.querySelector<HTMLInputElement>(`#prop-${name}`)!;
    const type = async (name: string, v: string) => {
      const f = field(name);
      f.value = v;
      f.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const key = async (name: string, k: string, shiftKey = false) => {
      field(name).dispatchEvent(
        new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();
    };
    return { fixture, el, field, type, key };
  }

  it('empty state, the icon inspector for one item, a hint for several', async () => {
    const { el, fixture } = await render();
    expect(el.querySelector('[data-testid="properties-empty"]')!.textContent).toContain(
      'Nothing selected',
    );
    store.selectItems([{ kind: 'group', group: 0 }]);
    await fixture.whenStable();
    expect(el.querySelector('app-icon-inspector')).not.toBeNull();
    expect(el.querySelector('[data-testid="properties-kind"]')!.textContent).toContain('Group 1');
    store.selectItems([{ kind: 'root' }, { kind: 'group', group: 0 }]);
    await fixture.whenStable();
    expect(el.querySelector('app-icon-inspector')).toBeNull();
    expect(el.querySelector('[data-testid="properties-items"]')).not.toBeNull();
  });

  it('sections from the spec; mixed for a multiple selection', async () => {
    store.select([q('n2')]);
    const { el, field, fixture } = await render();
    const sections = Array.from(el.querySelectorAll('section')).map((s) =>
      s.getAttribute('data-section'),
    );
    expect(sections).toEqual([
      'geometry',
      'appearance',
      'stroke',
      'transform',
      'advanced',
      'align',
      'clip',
    ]);
    expect(field('width').value).toBe('10');
    expect(field('fill').value).toBe('red');
    // Advanced is closed until opened
    expect(field('id')).toBeNull();
    store.select([q('n2'), q('n3')]);
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="properties-kind"]')!.textContent).toContain(
      '2 items selected',
    );
    expect(field('fill').value).toBe('');
    expect(field('fill').placeholder).toBe('mixed');
    expect(field('width').placeholder).toBe('mixed');
    store.select([q('n2'), q('n4')]);
    await fixture.whenStable();
    expect(field('width')).toBeNull();
    expect(field('font-size')).toBeNull();
    expect(field('fill')).not.toBeNull();
  });

  it('typing is live, Enter makes ONE step; arrows ± step, ⇧ × 10; Escape takes back', async () => {
    store.select([q('n2')]);
    const { type, key } = await render();
    await type('width', '1');
    await type('width', '12');
    expect(store.document().node(q('n2'))!.getAttribute('width')).toBe('12');
    await key('width', 'Enter');
    expect(store.lastCommandJson()).toEqual({
      type: 'setAttributes',
      changes: [{ ref: q('n2'), name: 'width', value: '12' }],
    });
    await key('width', 'ArrowUp');
    await key('width', 'ArrowUp', true);
    expect(store.document().node(q('n2'))!.getAttribute('width')).toBe('23');
    await key('width', 'Escape');
    expect(store.document().node(q('n2'))!.getAttribute('width')).toBe('12');
    store.undo();
    expect(store.document().node(q('n2'))!.getAttribute('width')).toBe('10');
    expect(store.canUndo()).toBe(false);
  });

  it('opacity is clamped to its range; invalid text is not written', async () => {
    store.select([q('n2')]);
    const { type, key } = await render();
    await type('opacity', '0.95');
    await key('opacity', 'ArrowUp', true);
    expect(store.document().node(q('n2'))!.getAttribute('opacity')).toBe('1');
    await type('opacity', 'abc');
    expect(store.document().node(q('n2'))!.getAttribute('opacity')).toBe('1');
    await key('opacity', 'Enter');
  });

  it('a hex colour is normalised; the text content is edited as text', async () => {
    store.select([q('n2')]);
    const r = await render();
    await r.type('fill', '#0f0');
    await r.key('fill', 'Enter');
    expect(store.document().node(q('n2'))!.getAttribute('fill')).toBe('#00FF00');
    expect(store.undoLabel()).toBe('Undo Change Fill');
    store.select([q('n4')]);
    await r.fixture.whenStable();
    await r.type('text', 'Hello');
    await r.key('text', 'Enter');
    expect(store.document().node(q('n4'))!.textContent).toBe('Hello');
    expect(store.undoLabel()).toBe('Undo Change Text');
  });

  it('Reset and Reset All (asks first)', async () => {
    store.select([q('n2')]);
    const { el, fixture } = await render();
    const reset = el.querySelector<HTMLButtonElement>('button[aria-label="Reset Fill"]')!;
    reset.click();
    await fixture.whenStable();
    expect(store.document().node(q('n2'))!.hasAttribute('fill')).toBe(false);
    store.undo();
    const ask = TestBed.inject(AskService);
    const done = TestBed.inject(PropertiesService).resetAll();
    await Promise.resolve();
    await Promise.resolve();
    expect(ask.current()!.title).toBe('Reset all properties?');
    ask.answer('reset');
    expect(await done).toBe(true);
    expect(store.document().node(q('n2'))!.hasAttribute('fill')).toBe(false);
    expect(store.document().node(q('n2'))!.getAttribute('width')).toBe('10');
    expect(store.undoLabel()).toBe('Undo Reset All Properties');
  });

  it('properties.set runs like the panel (AI rule)', async () => {
    store.select([q('n2'), q('n3')]);
    const actions = TestBed.inject(ActionService);
    expect(actions.run('properties.set', { name: 'stroke', value: '#000' })).toBe(true);
    expect(store.document().node(q('n3'))!.getAttribute('stroke')).toBe('#000');
    expect(store.undoLabel()).toBe('Undo Change Stroke');
    // not a property of the selection / not a number: refused, nothing changed
    expect(TestBed.inject(PropertiesService).set('r', '3')).toBe(false);
    expect(TestBed.inject(PropertiesService).set('opacity', 'x')).toBe(false);
    expect(actions.run('properties.resetAll', { confirm: false })).toBe(true);
    expect(store.document().node(q('n3'))!.hasAttribute('stroke')).toBe(false);
  });
});
