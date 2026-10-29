import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { InsertNode } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { gradientAttributes, registerGradientActions } from './gradient-actions';
import { cssStops, readGradient } from './gradient-model';
import { GradientService } from './gradient.service';

describe('GradientService (prompt 032)', () => {
  let store: DocumentStore;
  let service: GradientService;
  let actions: ActionService;
  const root = () => store.document().node({ asset: 'a.svg', id: 'n1' })!;
  const add = (markup: string) => {
    store.execute(new InsertNode({ asset: 'a.svg', id: 'n1' }, markup));
    const el = root().lastElementChild!;
    return store.document().refOf(el)!;
  };
  const grad = (id: string) =>
    root().ownerDocument.getElementById(id) ?? root().querySelector(`#${id}`)!;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    service = TestBed.inject(GradientService);
    actions = TestBed.inject(ActionService);
    registerGradientActions(actions, service);
  });

  it('creates a linear gradient for the fill (one undo step) and reads it back', () => {
    const ref = add('<rect x="0" y="0" width="10" height="10" fill="#ff0000"/>');
    store.selection.set([ref]);
    expect(service.target()).toBeNull();
    expect(actions.run('gradient.create', { kind: 'linear', paint: 'fill' })).toBe(true);
    const el = store.document().node(ref)!;
    expect(el.getAttribute('fill')).toMatch(/^url\(#gradient-\d+\)$/);
    const t = service.target('fill')!;
    expect(t.info.kind).toBe('linear');
    expect(t.info.stops.map((s) => s.offset)).toEqual([0, 1]);
    expect(t.owner?.paint).toBe('fill');
    store.undo();
    expect(store.document().node(ref)!.getAttribute('fill')).toBe('#ff0000');
    expect(service.target()).toBeNull();
  });

  it('adds, changes and removes stops; at least two stay', () => {
    add(
      '<linearGradient id="g"><stop offset="0" stop-color="#000000"/>' +
        '<stop offset="1" stop-color="#ffffff"/></linearGradient>',
    );
    const ref = add('<rect width="10" height="10" fill="url(#g)"/>');
    store.selection.set([ref]);
    expect(actions.run('gradient.addStop', { offset: 0.5 })).toBe(true);
    let info = readGradient(grad('g'))!;
    expect(info.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    expect(info.stops[1].color).toBe('#808080');
    actions.run('gradient.setStop', { index: 1, color: '#ff0000', opacity: 0.5, offset: 0.25 });
    info = readGradient(grad('g'))!;
    expect(info.stops[1]).toMatchObject({ offset: 0.25, color: '#ff0000', opacity: 0.5 });
    expect(cssStops(info.stops)).toContain('25%');
    actions.run('gradient.removeStop', { index: 1 });
    expect(readGradient(grad('g'))!.stops).toHaveLength(2);
    expect(actions.enabled('gradient.removeStop')).toBe(false);
  });

  it('a colour in style is replaced, not shadowed', () => {
    add(
      '<linearGradient id="g"><stop offset="0" style="stop-color:#000;stop-opacity:1"/>' +
        '<stop offset="1" stop-color="#fff"/></linearGradient>',
    );
    store.selection.set([add('<rect width="10" height="10" fill="url(#g)"/>')]);
    actions.run('gradient.setStop', { index: 0, color: '#00ff00' });
    const stop = grad('g').querySelector('stop')!;
    expect(stop.getAttribute('stop-color')).toBe('#00ff00');
    expect(stop.getAttribute('style')).toBe('stop-opacity:1');
  });

  it('switches linear ↔ radial keeping id and stops; sets attributes', () => {
    add(
      '<linearGradient id="g" x1="0" x2="1" spreadMethod="reflect"><stop offset="0"/>' +
        '<stop offset="1" stop-color="#fff"/></linearGradient>',
    );
    store.selection.set([add('<rect width="10" height="10" fill="url(#g)"/>')]);
    actions.run('gradient.set', { kind: 'radial' });
    const g = grad('g');
    expect(g.localName).toBe('radialGradient');
    expect(g.getAttribute('x1')).toBeNull();
    expect(g.getAttribute('spreadMethod')).toBe('reflect');
    expect(g.querySelectorAll('stop')).toHaveLength(2);
    actions.run('gradient.set', { attributes: { r: 0.25, gradientUnits: 'userSpaceOnUse' } });
    expect(grad('g').getAttribute('r')).toBe('0.25');
    actions.run('gradient.set', { attributes: { href: '#x' } });
    expect(grad('g').hasAttribute('href')).toBe(false);
  });

  it('a shared gradient can be made unique for the selection', () => {
    add('<linearGradient id="g"><stop offset="0"/><stop offset="1"/></linearGradient>');
    add('<rect width="10" height="10" fill="url(#g)"/>');
    const ref = add('<circle r="5" fill="url(#g)"/>');
    store.selection.set([ref]);
    expect(service.target()!.users).toBe(2);
    expect(actions.enabled('gradient.makeUnique')).toBe(true);
    actions.run('gradient.makeUnique');
    expect(store.document().node(ref)!.getAttribute('fill')).toBe('url(#g-2)');
    expect(service.target()!.users).toBe(1);
  });

  it('a live gesture is one undo step', () => {
    add('<linearGradient id="g"><stop offset="0"/><stop offset="1"/></linearGradient>');
    store.selection.set([add('<rect width="10" height="10" fill="url(#g)"/>')]);
    service.begin();
    for (const o of [0.1, 0.2, 0.3]) service.setStop(service.target()!, 0, { offset: o });
    service.end();
    expect(readGradient(grad('g'))!.stops[0].offset).toBe(0.3);
    store.undo();
    expect(readGradient(grad('g'))!.stops[0].offset).toBe(0);
  });
});

describe('gradientAttributes', () => {
  it('takes known names with numbers, strings and null only', () => {
    expect(gradientAttributes({ x1: 0.5, gradientTransform: 'rotate(45)', fx: null })).toEqual({
      x1: '0.5',
      gradientTransform: 'rotate(45)',
      fx: null,
    });
    expect(gradientAttributes({ onload: 'x' })).toBeNull();
    expect(gradientAttributes({ x1: {} })).toBeNull();
    expect(gradientAttributes([])).toBeNull();
  });
});
