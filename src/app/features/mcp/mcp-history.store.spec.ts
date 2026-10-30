import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { registerAddActions } from '../commands/add-actions';
import { AddService } from '../commands/add.service';
import { DocumentStore } from '../document/document.store';
import { SetAttribute } from '../document/commands/node-commands';
import { registerFileActions } from '../files/file-actions';
import { FilesService } from '../files/files.service';
import { RecentFilesService } from '../files/recent-files.service';
import { McpHistoryPopover } from './mcp-history-popover';
import { McpStore } from './mcp.store';

const a = (id: string) => ({ asset: 'a.svg', id });

describe('AI history (prompt 086)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let store: DocumentStore;
  let mcp: McpStore;
  let files: FilesService;
  let actions: ActionService;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    files = TestBed.inject(FilesService);
    store = new DocumentStore(treeDocument());
    files.store.set(store);
    actions = TestBed.inject(ActionService);
    registerAddActions(actions, TestBed.inject(AddService));
    registerFileActions(actions, files, TestBed.inject(RecentFilesService));
    mcp = TestBed.inject(McpStore);
    mcp.start(TestBed.inject(DestroyRef));
  });

  const setFill = (id: string, value: string) =>
    backend.mcp.send('run_command', {
      command: { type: 'setAttribute', ref: a(id), name: 'fill', value },
    });

  it('records every call of the bridge: tool, detail, result, undo step', async () => {
    await backend.mcp.send('get_tree');
    await setFill('n7', '#123456');
    await backend.mcp.send('run_action', { action: 'file.save' });
    const h = mcp.history();
    expect(h.map((e) => [e.tool, e.detail, e.ok, e.code])).toEqual([
      ['run_action', 'file.save', false, 'unavailable'],
      ['run_command', 'setAttribute', true, null],
      ['get_tree', '', true, null],
    ]);
    expect(h[2].undoId).toBeNull();
    expect(h[1].undoId).toBe(store.undoTopId());
    expect(mcp.badge()).toBe(true);
  });

  it('offers undo only for the last step and moves it along', async () => {
    await setFill('n7', '#111111');
    await setFill('n7', '#222222');
    const [second, first] = mcp.history();
    expect(mcp.undoable(second)).toBe(true);
    expect(mcp.undoable(first)).toBe(false);
    expect(mcp.undoEntry(first)).toBe(false);
    expect(mcp.undoEntry(second)).toBe(true);
    expect(store.document().node(a('n7'))!.getAttribute('fill')).toBe('#111111');
    // now the first is on top
    expect(mcp.undoable(second)).toBe(false);
    expect(mcp.undoable(first)).toBe(true);
    // a step of the user in between: no undo for the AI's any more
    store.execute(new SetAttribute(a('n7'), 'stroke', 'red', 'changeAttribute'));
    expect(mcp.undoable(first)).toBe(false);
  });

  it('an AI undo is no step of its own', async () => {
    await setFill('n7', '#111111');
    await setFill('n7', '#222222');
    await backend.mcp.send('run_action', { action: 'edit.undo' });
    const [undo, second, first] = mcp.history();
    expect(undo.undoId).toBeNull();
    expect(mcp.undoable(undo)).toBe(false);
    expect(mcp.undoable(second)).toBe(false);
    expect(mcp.undoable(first)).toBe(true);
  });

  it('a call on another document is not undone from here', async () => {
    await setFill('n7', '#111111');
    const [e] = mcp.history();
    files.store.set(new DocumentStore(treeDocument()));
    expect(mcp.undoable(e)).toBe(false);
  });

  it('opens as a popover, lists the calls, undoes and clears', async () => {
    await backend.mcp.send('get_tree');
    await setFill('n7', '#111111');
    const dialogs = TestBed.inject(DialogService);
    expect(actions.run('mcp.history')).toBe(true);
    expect(dialogs.open()).toBe('aiHistory');
    expect(dialogs.popover()).toBe(true);
    const f = TestBed.createComponent(McpHistoryPopover);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('[data-testid="ai-history-entry"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('run_command');
    expect(rows[0].textContent).toContain('setAttribute');
    expect(rows[1].querySelector('[data-testid="ai-history-undo"]')).toBeNull();
    el.querySelector<HTMLElement>('[data-testid="ai-history-undo"]')!.click();
    f.detectChanges();
    expect(store.canUndo()).toBe(false);
    expect(el.querySelector('[data-testid="ai-history-undo"]')).toBeNull();
    expect(el.querySelector('[data-testid="ai-history-disconnect"]')).toBeNull();
    backend.mcp.setStatus({ enabled: true, connections: 1, sidecar: '/x', debug: false });
    f.detectChanges();
    expect(el.querySelector('[data-testid="ai-history-disconnect"]')).not.toBeNull();
    el.querySelector<HTMLElement>('[data-testid="ai-history-clear"]')!.click();
    f.detectChanges();
    expect(mcp.history()).toEqual([]);
    expect(el.querySelector('[data-testid="ai-history-empty"]')).not.toBeNull();
    expect(actions.run('mcp.history')).toBe(true);
    expect(dialogs.open()).toBeNull();
  });

  it('runs the connection test and keeps its result', async () => {
    expect(actions.enabled('mcp.test')).toBe(false);
    backend.mcp.setStatus({ enabled: true, connections: 0, sidecar: '/x', debug: false });
    expect(actions.enabled('mcp.test')).toBe(true);
    const p = await mcp.test();
    expect(p).toMatchObject({ ok: true, tools: 20 });
    expect(mcp.probe()).toEqual(p);
    backend.mcp.setStatus({ enabled: true, connections: 0, sidecar: null, debug: false });
    expect(await mcp.test()).toBeNull();
    expect(mcp.probeError()?.code).toBe('sidecar_missing');
  });
});
