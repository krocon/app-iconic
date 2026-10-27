import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { commandFromJson } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { EditService } from '../hierarchy/edit.service';
import { registerSvgSourceActions } from './svg-source-actions';
import { SvgSourceService } from './svg-source.service';

const a = (id: string) => ({ asset: 'a.svg', id });
const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('SvgSourceService (design 011)', () => {
  let store: DocumentStore;
  let service: SvgSourceService;
  let actions: ActionService;

  beforeEach(() => {
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    service = TestBed.inject(SvgSourceService);
    actions = TestBed.inject(ActionService);
    registerSvgSourceActions(actions, service);
  });

  describe('target (E2)', () => {
    it('one node, the asset of a root / layer / group, nothing else', () => {
      expect(service.target()).toBeNull();
      store.select([a('n7')]);
      expect(service.target()).toEqual({ kind: 'node', ref: a('n7') });
      store.select([a('n1')]);
      expect(service.target()).toEqual({ kind: 'asset', asset: 'a.svg' });
      store.select([a('n7'), a('n8')]);
      expect(service.target()).toBeNull();
      store.selectItems([{ kind: 'layer', group: 1, layer: 0 }]);
      expect(service.target()).toEqual({ kind: 'asset', asset: 'b.svg' });
      store.selectItems([{ kind: 'group', group: 0 }]);
      expect(service.target()).toEqual({ kind: 'asset', asset: 'a.svg' });
      store.selectItems([{ kind: 'layer', group: 1, layer: 1 }]); // PNG
      expect(service.target()).toBeNull();
      store.selectItems([{ kind: 'root' }]);
      expect(service.target()).toBeNull();
      expect(actions.enabled('edit.editSvg')).toBe(false);
    });

    it('the source is the text without internal attributes', () => {
      expect(service.source({ kind: 'node', ref: a('n7') })).toBe(
        `<rect ${NS} width="10" height="20" fill="white" stroke="none"/>`,
      );
      expect(service.source({ kind: 'asset', asset: 'b.svg' })).toBe(
        `<svg ${NS}><rect id="r" width="1" height="1"/></svg>`,
      );
    });
  });

  describe('apply (E5, E6)', () => {
    it('replaces a node as one step "Edit SVG Code", the new node is selected', () => {
      store.select([a('n7')]);
      const before = store.document().snapshot();
      expect(service.apply({ kind: 'node', ref: a('n7') }, '<rect width="10" fill="blue"/>')).toBe(
        'ok',
      );
      const ref = store.selection()[0];
      expect(store.document().node(ref)!.getAttribute('fill')).toBe('blue');
      expect(store.undoLabel()).toBe('Undo Edit SVG Code');
      const json = store.lastCommandJson()!;
      expect(json).toMatchObject({ type: 'replaceNode', ref: a('n7') });
      store.undo();
      expect(store.document().snapshot()).toBe(before);
      // the step as JSON makes the same change
      store.runCommand(JSON.parse(JSON.stringify(json)));
      expect(store.document().node(a('n6'))!.firstElementChild!.getAttribute('fill')).toBe('blue');
    });

    it('refuses invalid text without a step', () => {
      const t = { kind: 'node' as const, ref: a('n7') };
      expect(service.apply(t, '<rect')).toBe('invalid');
      expect(service.apply(t, '<rect/><rect/>')).toBe('invalid');
      expect(store.canUndo()).toBe(false);
    });

    it('replaces an asset and keeps the selection by position', () => {
      store.select([a('n8'), { asset: 'b.svg', id: 'n12' }]);
      const text = service.source({ kind: 'asset', asset: 'a.svg' })!.replace('r="5"', 'r="7"');
      expect(service.apply({ kind: 'asset', asset: 'a.svg' }, text)).toBe('ok');
      const sel = store.selection();
      expect(sel).toHaveLength(2);
      expect(sel[0]).toEqual({ asset: 'b.svg', id: 'n12' });
      const circle = store.document().node(sel[1])!;
      expect([circle.localName, circle.getAttribute('r')]).toEqual(['circle', '7']);
      expect(store.lastCommandJson()).toMatchObject({ type: 'replaceAssetMarkup', asset: 'a.svg' });
    });

    it('edit.editSvg { markup } replaces the target directly (AI)', () => {
      store.select([a('n7')]);
      expect(actions.run('edit.editSvg', { markup: '<ellipse rx="3"/>' })).toBe(true);
      expect(store.document().node(store.selection()[0])!.localName).toBe('ellipse');
    });

    it('edit.editSvg without arguments opens the dialog for the target', () => {
      store.select([a('n7')]);
      actions.run('edit.editSvg');
      expect(TestBed.inject(DialogService).open()).toBe('svgSource');
      expect(service.editing()).toEqual({ kind: 'node', ref: a('n7') });
    });
  });

  describe('optimize path (E12)', () => {
    beforeEach(() => {
      store.execute(
        commandFromJson({
          type: 'setAttribute',
          ref: a('n9'),
          name: 'd',
          value: 'M0 0 L5 0 L10 0 L15 0 L20 0.2',
        }),
      );
    });

    it('collects the paths of the selection, also inside groups and layers', () => {
      store.select([a('n7')]);
      expect(service.optimizeTargets()).toEqual([]);
      expect(actions.enabled('path.optimize')).toBe(false);
      store.select([a('n1')]);
      expect(service.optimizeTargets().map((e) => e.localName)).toEqual(['path']);
      store.selectItems([{ kind: 'layer', group: 0, layer: 0 }]);
      expect(service.optimizeTargets()).toHaveLength(1);
      expect(actions.enabled('path.optimize')).toBe(true);
    });

    it('previews and optimizes as one step "Optimize Path"', () => {
      store.select([a('n9')]);
      const stats = service.optimizeStats({ epsilon: 1 });
      expect(stats).toMatchObject({ paths: 1, changed: 1, pointsBefore: 5, pointsAfter: 2 });
      expect(actions.run('path.optimize', { epsilon: 1 })).toBe(true);
      expect(store.document().node(a('n9'))!.getAttribute('d')).toBe('M0 0L20 0.2');
      expect(store.undoLabel()).toBe('Undo Optimize Path');
      expect(store.lastCommandJson()).toMatchObject({
        type: 'setAttributes',
        label: 'optimizePath',
      });
      // nothing left to do: no further step
      expect(service.optimize({ epsilon: 1 })).toBe(false);
    });

    it('path.optimize without arguments opens the preview', () => {
      store.select([a('n9')]);
      actions.run('path.optimize');
      expect(TestBed.inject(DialogService).open()).toBe('optimizePath');
    });
  });

  it('"Copy XML" formats, "Copy" keeps the text (E9)', () => {
    const edit = TestBed.inject(EditService);
    store.select([a('n6')]);
    expect(edit.copyText()).toBe(
      `<g ${NS} id="grp"><rect width="10" height="20" fill="white" stroke="none"/>` +
        '<circle r="5" style="fill: rgb(0, 128, 0)"/></g>',
    );
    expect(edit.copyText(true)).toBe(
      [
        `<g ${NS} id="grp">`,
        '  <rect width="10" height="20" fill="white" stroke="none"/>',
        '  <circle r="5" style="fill: rgb(0, 128, 0)"/>',
        '</g>',
        '',
      ].join('\n'),
    );
  });
});
