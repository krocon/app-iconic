import { TestBed } from '@angular/core/testing';
import { allFieldsDocument } from '../../../testing/documents';
import { fakeBackend } from '../../../testing/providers';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DocumentStore } from '../document/document.store';
import { IconItem } from '../document/model/selection';
import { FilesService } from '../files/files.service';
import { registerIconActions } from './icon-actions';
import { fieldDef } from './icon-fields';
import { IconInspector } from './icon-inspector';
import { IconInspectorService } from './icon-inspector.service';
import { formatIconJson } from './icon-json-text';

describe('IconInspector (design 010)', () => {
  let store: DocumentStore;
  let icon: IconInspectorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(allFieldsDocument());
    TestBed.inject(FilesService).store.set(store);
    TestBed.inject(CanvasViewStore).set('appearance', 'light');
    icon = TestBed.inject(IconInspectorService);
    registerIconActions(TestBed.inject(ActionService), icon);
  });

  async function render(target: IconItem) {
    const fixture = TestBed.createComponent(IconInspector);
    fixture.componentRef.setInput('store', store);
    fixture.componentRef.setInput('target', target);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const sections = () =>
      Array.from(el.querySelectorAll('app-inspector-section')).map((s) =>
        s.getAttribute('data-section'),
      );
    const input = (id: string) => el.querySelector<HTMLInputElement>(`[id="${id}"]`);
    return { fixture, el, sections, input };
  }

  it('root: background, platforms, other properties, icon.json preview', async () => {
    const { el, sections, input } = await render({ kind: 'root' });
    expect(sections()).toEqual(['background', 'platforms', 'other', 'json']);
    expect(input('icon-background-kind')!.value).toBe('linear-gradient');
    expect(input('icon-background-color-0')!.value).toBe('#4F0AF5');
    expect(input('icon-squares')!.value).toBe('iOS+macOS');
    expect(input('icon-watchos')!.checked).toBe(true);
    expect(input('icon-color-space')!.value).toBe('display-p3');
    const other = el.querySelector('[data-testid="other-properties"]')!.textContent!;
    expect(other).toContain('x-future-root');
    expect(other).not.toContain('fill-specializations');
    expect(el.querySelector('[data-testid="json-preview"]')!.textContent).toBe(
      formatIconJson(store.document().iconJson) + '\n',
    );
  });

  it('group: sections in order, name, approximation notes, unknown keys read-only', async () => {
    const { el, sections, input } = await render({ kind: 'group', group: 0 });
    expect(sections()).toEqual([
      'groupIdentity',
      'appearance',
      'liquidGlass',
      'shadow',
      'translucency',
      'position',
      'other',
      'json',
    ]);
    expect(input('g0-name')!.value).toBe('Front');
    expect(input('g0-shadow.kind')!.value).toBe('layer-color');
    expect(input('g0-opacity')!.value).toBe('0.9');
    expect(input('g0-blur-material')!.checked).toBe(false);
    const note = (s: string) => el.querySelector(`[data-section="${s}"] [data-note]`);
    expect(note('shadow')!.getAttribute('data-note')).toBe('approximation');
    expect(note('liquidGlass')!.getAttribute('data-note')).toBe('notRendered');
    expect(el.querySelector('[data-testid="other-properties"]')!.textContent).toContain(
      'x-future-group',
    );
  });

  it('layer in Dark: own values can be removed, shared ones are marked', async () => {
    icon.setAppearance('dark');
    const { el, input, fixture } = await render({ kind: 'layer', group: 0, layer: 1 });
    expect(input('l0-1-opacity')!.value).toBe('0.5');
    const removable = el.querySelectorAll('[data-testid="remove-variant"]').length;
    // dark variants of the fixture: asset, opacity, blend mode, glass, fill
    expect(removable).toBe(5);
    const before = store.document().iconJson.groups![0].layers![1]['opacity-specializations'];
    expect(before).toHaveLength(2);
    icon.removeVariant({ kind: 'layer', group: 0, layer: 1 }, 'opacity');
    await fixture.whenStable();
    // only the base entry was left → back to a plain `opacity`
    const l = store.document().iconJson.groups![0].layers![1];
    expect(l['opacity-specializations']).toBeUndefined();
    expect(l.opacity).toBe(1);
    expect(input('l0-1-opacity')!.value).toBe('1');
    expect(store.undoLabel()).toBe('Undo Remove Appearance Variant');
  });

  it('a typed layer name is renamed on Enter, unique among the layers', async () => {
    const { input, fixture } = await render({ kind: 'layer', group: 0, layer: 0 });
    const f = input('l0-0-name')!;
    f.value = 'shape dark';
    f.dispatchEvent(new Event('input'));
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(store.document().iconJson.groups![0].layers![0].name).toBe('shape dark 2');
    expect(store.undoLabel()).toBe('Undo Rename Layer');
  });
});

describe('IconInspectorService (design 010 E5, E14)', () => {
  let store: DocumentStore;
  let icon: IconInspectorService;
  let actions: ActionService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...fakeBackend().providers] });
    store = new DocumentStore(allFieldsDocument());
    TestBed.inject(FilesService).store.set(store);
    TestBed.inject(CanvasViewStore).set('appearance', 'light');
    icon = TestBed.inject(IconInspectorService);
    actions = TestBed.inject(ActionService);
    registerIconActions(actions, icon);
  });

  it('a slider is one gesture = one undo step; cancel restores', () => {
    const g = { kind: 'group', group: 0 } as const;
    const def = fieldDef('group', 'shadow.opacity')!;
    for (const v of [0.1, 0.2, 0.3]) expect(icon.edit(g, def, v)).toBe(true);
    icon.commit();
    expect(store.document().iconJson.groups![0].shadow!.opacity).toBe(0.3);
    expect(store.undoLabel()).toBe('Undo Change Shadow');
    store.undo();
    expect(store.document().iconJson.groups![0].shadow!.opacity).toBe(0.5);
    expect(store.canUndo()).toBe(false);
    icon.edit(g, def, 0.9);
    icon.cancel();
    expect(store.document().iconJson.groups![0].shadow!.opacity).toBe(0.5);
    expect(icon.edit(g, def, 7)).toBe(false);
  });

  it('the Dark appearance follows the canvas, Tinted is the inspector’s own', () => {
    const canvas = TestBed.inject(CanvasViewStore);
    icon.setAppearance('dark');
    expect(canvas.options().appearance).toBe('dark');
    icon.setAppearance('tinted');
    expect(icon.appearance()).toBe('tinted');
    expect(canvas.options().appearance).toBe('dark');
    icon.setAppearance('default');
    expect(canvas.options().appearance).toBe('light');
  });

  it('actions with arguments for the AI; wrong targets and values change nothing', () => {
    const before = formatIconJson(store.document().iconJson);
    expect(actions.run('icon.set', { group: 0, layer: 0, field: 'opacity', value: 0.25 })).toBe(
      true,
    );
    expect(store.document().iconJson.groups![0].layers![0].opacity).toBe(0.25);
    actions.run('icon.set', { group: 9, field: 'opacity', value: 0.2 });
    actions.run('icon.set', { layer: 0, field: 'opacity', value: 0.2 });
    actions.run('icon.set', { group: 0, field: 'nope', value: 0.2 });
    actions.run('icon.set', { group: 0, field: 'opacity', value: 'x' });
    actions.run('icon.setFill', { fill: { solid: 'not a colour' } });
    expect(store.undoLabel()).toBe('Undo Change Layer Opacity');
    actions.run('icon.set', {
      group: 0,
      field: 'translucency.value',
      value: 0.3,
      appearance: 'tinted',
    });
    expect(store.document().iconJson.groups![0]['translucency-specializations']).toEqual([
      { value: { enabled: true, value: 0.9 } },
      { appearance: 'tinted', value: { enabled: true, value: 0.3 } },
    ]);
    actions.run('icon.removeVariant', {
      group: 0,
      field: 'translucency.value',
      appearance: 'tinted',
    });
    actions.run('icon.setPlatforms', { squares: 'shared' });
    expect(store.document().iconJson['supported-platforms']!.squares).toBe('shared');
    actions.run('icon.renameAsset', { from: 'shape.svg', to: 'art.svg' });
    expect([...store.document().assets.keys()]).toEqual(['art.svg']);
    actions.run('icon.renameGroup', { group: 1, name: 'Back' });
    actions.run('icon.setColorSpace', { space: 'none' });
    expect(store.document().iconJson['color-space-for-untagged-svg-colors']).toBeUndefined();
    while (store.canUndo()) store.undo();
    expect(formatIconJson(store.document().iconJson)).toBe(before);
  });
});
