import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FakeIconFileApi } from '../../../testing/fake-icon-file-api';
import { treeDocument } from '../../../testing/tree-documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { AskService } from '../../shared/ask/ask.service';
import { registerAddActions } from '../commands/add-actions';
import { AddService } from '../commands/add.service';
import { DocumentStore } from '../document/document.store';
import { registerEditActions } from '../hierarchy/edit-actions';
import { EditService } from '../hierarchy/edit.service';
import { FilesService } from '../files/files.service';
import { registerFileActions } from '../files/file-actions';
import { RecentFilesService } from '../files/recent-files.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { registerSettingsActions } from '../settings/settings-actions';
import { SettingsStore } from '../settings/settings.store';
import { McpStore } from './mcp.store';
import { deniedReason } from './mcp-policy';

const a = (id: string) => ({ asset: 'a.svg', id });

describe('McpStore (design 018)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let store: DocumentStore;
  let mcp: McpStore;
  let files: FilesService;
  let answers: string[];

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    files = TestBed.inject(FilesService);
    store = new DocumentStore(treeDocument());
    files.store.set(store);
    const actions = TestBed.inject(ActionService);
    registerAddActions(actions, TestBed.inject(AddService));
    registerFileActions(actions, files, TestBed.inject(RecentFilesService));
    registerEditActions(actions, TestBed.inject(EditService), TestBed.inject(DialogService));
    registerSettingsActions(
      actions,
      TestBed.inject(SettingsStore),
      TestBed.inject(DialogService),
      TestBed.inject(AskService),
    );
    answers = [];
    vi.spyOn(TestBed.inject(AskService), 'ask').mockImplementation(async () => {
      return answers.shift() ?? 'deny';
    });
    mcp = TestBed.inject(McpStore);
    mcp.start(TestBed.inject(DestroyRef));
  });

  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const r = await backend.mcp.send(tool, args);
    return r.error ? { error: r.error } : (r.result as Record<string, unknown>);
  };

  it('answers the calls of the bridge and tells it when it is ready', async () => {
    await mcp.ready();
    expect(backend.mcp.readyCount).toBe(1);
    const d = await call('describe');
    expect(d).toMatchObject({ name: 't.icon', path: '/t.icon', dirty: false, pristine: false });
    const e = await call('nope');
    expect(e).toEqual({ error: { code: 'invalid_request', message: 'unknown tool nope' } });
  });

  it('runs a command as one AI undo step and reports the new revision', async () => {
    const rev = store.revision();
    const r = await call('run_command', {
      command: { type: 'setAttribute', ref: a('n7'), name: 'fill', value: '#123456' },
      expected_revision: rev,
    });
    expect(r).toMatchObject({ undo: 'Undo AI: Change Attribute' });
    expect(r['revision']).toBeGreaterThan(rev);
    expect(store.document().node(a('n7'))!.getAttribute('fill')).toBe('#123456');
    // the old revision is stale now
    const c = await call('run_command', {
      command: { type: 'setAttribute', ref: a('n7'), name: 'fill', value: 'red' },
      expected_revision: rev,
    });
    expect(c).toMatchObject({ error: { code: 'revision_conflict' } });
    expect(String((c as { error: { message: string } }).error.message)).toContain('"revision"');
    // a bad command changes nothing
    const bad = await call('run_command', { command: { type: 'removeNode', ref: a('n99') } });
    expect(bad).toMatchObject({ error: { code: 'invalid_request' } });
    store.undo();
    expect(store.document().node(a('n7'))!.getAttribute('fill')).not.toBe('#123456');
  });

  it('runs an action with arguments – a circle with a gradient is one step', async () => {
    const r = await call('run_action', {
      action: 'add.circle',
      args: { cx: 300, cy: 400, r: 90, fill: 'url(#lg)' },
    });
    expect(r).toMatchObject({ ran: true, undo: 'Undo AI: Add Circle' });
    const sel = r['selection'] as { asset: string; id: string }[];
    const el = store.document().node(sel[0])!;
    expect([el.localName, el.getAttribute('r'), el.getAttribute('fill')]).toEqual([
      'circle',
      '90',
      'url(#lg)',
    ]);
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(store.document().node(sel[0])).toBeNull();
    expect(store.canUndo()).toBe(false);
  });

  it('refuses actions outside the policy, disabled ones and wrong arguments', async () => {
    for (const action of ['app.quit', 'file.save', 'edit.paste', 'mcp.disconnect']) {
      expect(await call('run_action', { action })).toMatchObject({
        error: { code: 'unavailable' },
      });
    }
    expect(
      await call('run_action', {
        action: 'settings.set',
        args: { key: 'mcp.enabled', value: true },
      }),
    ).toMatchObject({ error: { code: 'unavailable' } });
    expect(await call('run_action', { action: 'add.circle', args: { r: 'big' } })).toMatchObject({
      error: { code: 'invalid_request' },
    });
    expect(await call('run_action', { action: 'edit.redo' })).toMatchObject({
      error: { code: 'unavailable' },
    });
    const listed = (await call('list_actions'))['actions'] as { id: string }[];
    expect(listed.some((x) => x.id === 'add.circle')).toBe(true);
    expect(listed.some((x) => x.id === 'app.quit' || x.id.startsWith('file.'))).toBe(false);
    expect(deniedReason('settings.set', { key: 'canvas.rulers' })).toBeNull();
  });

  it('reads the tree, a node and an asset – bounded', async () => {
    const t = await call('get_tree', { max_nodes: 3 });
    expect(t).toMatchObject({ truncated: true });
    expect((t['nodes'] as unknown[]).length).toBe(3);
    expect(t['total']).toBeGreaterThan(10);
    const all = (await call('get_tree', { max_nodes: 500 }))['nodes'] as {
      kind: string;
      ref?: unknown;
      tag?: string;
    }[];
    expect(all.find((n) => n.tag === 'circle')).toMatchObject({ kind: 'node', ref: a('n8') });
    const n = await call('get_node', { node: a('n7') });
    expect(n).toMatchObject({ tag: 'rect', parent: a('n6'), childCount: 0, bbox: null });
    expect(Object.keys(n['attributes'] as object).some((k) => k.startsWith('data-ai'))).toBe(false);
    expect(await call('get_node', { node: a('n99') })).toMatchObject({
      error: { code: 'invalid_request' },
    });
    const svg = await call('get_asset_svg', { asset: 'a.svg', max_chars: 40 });
    expect(svg).toMatchObject({ truncated: true });
    expect((svg['text'] as string).length).toBe(40);
    const full = await call('get_asset_svg', { asset: 'a.svg', max_chars: 20000 });
    expect(full['text']).not.toContain('data-ai-id');
    const ids = await call('get_asset_svg', { asset: 'a.svg', max_chars: 20000, node_ids: true });
    expect(ids['text']).toContain('data-ai-id="n7"');
    expect(await call('get_asset_svg', { asset: 'p.png' })).toMatchObject({
      error: { code: 'invalid_request' },
    });
    const doc = await call('get_document');
    expect(doc).toMatchObject({ name: 't.icon', iconJson: { fill: 'automatic' } });
    expect((doc['groups'] as unknown[]).length).toBe(2);
    expect(await call('get_document', { icon_json: false })).not.toHaveProperty('iconJson');
  });

  it('selects nodes and inserts cleaned SVG as one step', async () => {
    expect(await call('select', { nodes: [a('n7'), a('n8')] })).toEqual({
      selection: [a('n7'), a('n8')],
    });
    expect(await call('select', { nodes: [a('n77')] })).toMatchObject({
      error: { code: 'invalid_request' },
    });
    const r = await call('insert_svg', {
      markup: '<rect width="10" height="10" onclick="alert(1)"/><circle r="4"/>',
      parent: a('n6'),
    });
    expect(r).toMatchObject({ undo: 'Undo AI: Add SVG Snippet' });
    const text = store.document().node(a('n6'))!.outerHTML;
    expect(text).toContain('<circle');
    expect(text).not.toContain('onclick');
    expect(await call('insert_svg', { markup: 'no svg here' })).toMatchObject({
      error: { code: 'invalid_request' },
    });
  });

  it('saves to a new path and exports only with the permission of the user', async () => {
    // a file the fake backend knows (session), opened quietly like open_document does
    expect(await call('open', { path: FakeIconFileApi.CAMSCANNER })).toMatchObject({
      path: FakeIconFileApi.CAMSCANNER,
    });
    expect(await call('run_action', { action: 'add.rect' })).toMatchObject({ ran: true });
    // own file: no question
    expect(await call('save_document')).toMatchObject({
      path: FakeIconFileApi.CAMSCANNER,
      dirty: false,
    });
    expect(backend.files.saved).toHaveLength(1);
    // new path: denied, then allowed
    expect(await call('save_document', { path: '/out/x.icon' })).toMatchObject({
      error: { code: 'denied' },
    });
    answers.push('allow');
    expect(await call('save_document', { path: '/out/x.icon', format: 'zip' })).toMatchObject({
      path: '/out/x.icon',
      format: 'zip',
    });
    expect(await call('export_png', { dir: '/out', sizes: [64] })).toMatchObject({
      error: { code: 'denied' },
    });
    answers.push('allow');
    const ex = await call('export_png', { dir: '/out', sizes: [64], appearances: ['light'] });
    expect((ex['files'] as unknown[]).length).toBe(1);
    expect(backend.exporter.calls.at(-1)).toMatchObject({ kind: 'png', sizes: [64] });
    // without the question when the setting says so
    TestBed.inject(SettingsStore).set('mcp.confirmFiles', false);
    expect(await call('export_svg', { dir: '/out', overwrite: true })).toHaveProperty('files');
  });

  it('builds the preview SVG for Rust to render', async () => {
    const p = await call('preview_svg', { appearance: 'dark', mask: 'circle' });
    expect(p['svg']).toContain('<svg');
    expect(p['svg']).toContain('clipPath');
    expect(p['revision']).toBe(store.revision());
  });

  it('runs calls one after the other and shows the bridge state', async () => {
    const both = Promise.all([
      call('run_action', { action: 'add.rect', args: { width: 10, height: 10 } }),
      call('run_action', { action: 'add.line' }),
    ]);
    const [r1, r2] = await both;
    expect((r2['revision'] as number) > (r1['revision'] as number)).toBe(true);
    store.undo();
    expect(store.undoLabel()).toBe('Undo AI: Add Rectangle');
    backend.mcp.setStatus({ enabled: true, connections: 2, sidecar: '/opt/app-iconic-mcp' });
    expect(mcp.connected()).toBe(true);
    expect(mcp.command()).toBe('claude mcp add app-iconic -- "/opt/app-iconic-mcp"');
    expect(TestBed.inject(ActionService).run('mcp.disconnect')).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(backend.mcp.disconnects).toBe(1);
    expect(mcp.connected()).toBe(false);
  });

  it('a document of an empty window answers unknown_document', async () => {
    files.store.set(null);
    expect(await call('get_tree')).toMatchObject({ error: { code: 'unknown_document' } });
  });
});
