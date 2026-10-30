import { TestBed } from '@angular/core/testing';
import { FakeIconFileApi } from '../../../testing/fake-icon-file-api';
import { FakeRecoveryApi } from '../../../testing/fake-recovery-api';
import { fakeBackend } from '../../../testing/providers';
import { AskService } from '../../shared/ask/ask.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { SetAttribute } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { SettingsStore } from '../settings/settings.store';
import { GESTURE_RETRY_MS, RecoveryService } from './recovery.service';

const CAM = FakeIconFileApi.CAMSCANNER;

/** One change to the first asset's root: `opacity`. */
function change(s: DocumentStore, value: string): void {
  const doc = s.document();
  const asset = [...doc.assets.keys()][0];
  const id = doc.assets.get(asset)!.svg!.root.getAttribute('data-ai-id')!;
  s.execute(new SetAttribute({ asset, id }, 'opacity', value));
}

/** Recovery snapshots: timing, clean-up rules and the offer at start (prompt 083). */
describe('RecoveryService', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let rec: FakeRecoveryApi;
  let files: FilesService;
  let service: RecoveryService;
  let answers: string[];

  /** Lets the effect see the document, then the fake clock run. */
  async function run(ms: number): Promise<void> {
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(ms);
    await service.pending;
    TestBed.tick();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    backend = fakeBackend();
    rec = backend.recovery;
    TestBed.configureTestingModule({ providers: backend.providers });
    files = TestBed.inject(FilesService);
    service = TestBed.inject(RecoveryService);
    await TestBed.inject(SettingsStore).load();
    answers = [];
    vi.spyOn(TestBed.inject(AskService), 'ask').mockImplementation(
      async (q) => answers.shift() ?? q.cancel,
    );
    backend.window.start = CAM;
    await files.start();
  });

  afterEach(() => vi.useRealTimers());

  it('writes a snapshot 30 s after the first change – not before, not while clean', async () => {
    await run(60_000);
    expect(rec.writes).toEqual([]);
    change(files.store()!, '0.5');
    await run(29_000);
    expect(rec.writes).toEqual([]);
    change(files.store()!, '0.4'); // rides along, the timer is not restarted
    await run(1_000);
    expect(rec.writes).toHaveLength(1);
    const w = rec.writes[0];
    expect(w).toMatchObject({ id: null, path: CAM, from: null, format: 'bundle' });
    // like saving: the changed asset with content, the rest by name from the session
    expect(w.assets.some((a) => !a.unchanged && a.text?.includes('opacity="0.4"'))).toBe(true);
    expect(w.assets.some((a) => a.unchanged)).toBe(true);
    const snap = rec.snapshots.get(service.currentId!)!;
    expect(snap.path).toBe(CAM);
    expect(snap.file.assets.every((a) => a.text !== undefined)).toBe(true);
    // nothing changed since: no second write
    await run(60_000);
    expect(rec.writes).toHaveLength(1);
  });

  it('a later change replaces the same snapshot', async () => {
    change(files.store()!, '0.5');
    await run(30_000);
    const id = service.currentId;
    change(files.store()!, '0.3');
    await run(30_000);
    expect(rec.writes.map((w) => w.id)).toEqual([null, id]);
    expect(rec.snapshots.size).toBe(1);
    expect(JSON.stringify(rec.snapshots.get(id!)!.file)).toContain('opacity=\\"0.3\\"');
  });

  it('follows the interval setting; 0 = off', async () => {
    const settings = TestBed.inject(SettingsStore);
    settings.set('recovery.interval', 0);
    change(files.store()!, '0.5');
    await run(120_000);
    expect(rec.writes).toEqual([]);
    settings.set('recovery.interval', 5);
    await run(5_000);
    expect(rec.writes).toHaveLength(1);
  });

  it('waits for a gesture to end', async () => {
    const s = files.store()!;
    change(s, '0.5');
    const inGesture = vi.spyOn(s, 'inGesture', 'get').mockReturnValue(true);
    await run(30_000);
    expect(rec.writes).toEqual([]);
    inGesture.mockReturnValue(false);
    await run(GESTURE_RETRY_MS);
    expect(rec.writes).toHaveLength(1);
  });

  it('is removed after saving', async () => {
    change(files.store()!, '0.5');
    await run(30_000);
    expect(rec.snapshots.size).toBe(1);
    await files.save();
    await run(0);
    expect(rec.snapshots.size).toBe(0);
    expect(service.currentId).toBeNull();
  });

  it('is removed when the window closes with "Don\'t Save"', async () => {
    change(files.store()!, '0.5');
    await run(30_000);
    answers.push('discard');
    expect(await files.close()).toBe(true);
    expect(rec.snapshots.size).toBe(0);
    expect(backend.window.closed).toBe(true);
    // no snapshot any more, even with changes
    change(files.store()!, '0.2');
    await run(60_000);
    expect(rec.snapshots.size).toBe(0);
  });

  it('stays when closing is cancelled; goes when the document is replaced', async () => {
    change(files.store()!, '0.5');
    await run(30_000);
    expect(await files.close()).toBe(false); // the question was cancelled
    expect(rec.snapshots.size).toBe(1);
    answers.push('discard');
    await files.newDocument();
    await run(0);
    expect(rec.snapshots.size).toBe(0);
  });

  it('a write that returns after saving is removed again', async () => {
    change(files.store()!, '0.5');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(30_000);
    // the write is on its way – the user saves meanwhile
    await files.save();
    await service.pending;
    await run(0);
    expect(rec.snapshots.size).toBe(0);
  });

  it('a write error is quiet; the next change tries again', async () => {
    change(files.store()!, '0.5');
    rec.failNext = { code: 'io', message: 'disk full' };
    await run(30_000);
    expect(rec.snapshots.size).toBe(0);
    change(files.store()!, '0.4');
    await run(30_000);
    expect(rec.snapshots.size).toBe(1);
  });
});

describe('RecoveryService – the offer', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let rec: FakeRecoveryApi;
  let files: FilesService;
  let service: RecoveryService;
  let dialogs: DialogService;
  let answers: string[];
  let asked: string[];

  beforeEach(async () => {
    backend = fakeBackend();
    rec = backend.recovery;
    TestBed.configureTestingModule({ providers: backend.providers });
    files = TestBed.inject(FilesService);
    service = TestBed.inject(RecoveryService);
    dialogs = TestBed.inject(DialogService);
    answers = [];
    asked = [];
    vi.spyOn(TestBed.inject(AskService), 'ask').mockImplementation(async (q) => {
      asked.push(q.title);
      return answers.shift() ?? q.cancel;
    });
    await files.start();
  });

  /** A crash left the camscanner icon with a change, saved at `savedAt`. */
  async function crashed(path: string | null, savedAt = 1000): Promise<string> {
    const api = backend.files;
    const dto = await api.openIcon(CAM);
    const text = dto.assets[0].text!.replace('<svg', '<svg opacity="0.25"');
    const file = api.assemble({
      path: path ?? '',
      format: 'zip',
      iconJson: dto.iconJson,
      assets: dto.assets.map((a, i) =>
        i === 0 ? { name: a.name, unchanged: false, text } : { name: a.name, unchanged: true },
      ),
      from: CAM,
    });
    await api.closeIcon(CAM);
    return rec.plant({ path, savedAt, file });
  }

  it('shows what apps that are gone left – once per app, newest first', async () => {
    await crashed(CAM, 1000);
    await crashed(null, 2000);
    await service.offerAtStart();
    expect(dialogs.open()).toBe('recovery');
    expect(service.entries().map((e) => e.name)).toEqual([null, 'camscanner.icon']);
    dialogs.close();
    // a second window of the same app: no offer
    await service.offerAtStart();
    expect(dialogs.open()).toBeNull();
    // the menu shows them again
    await service.show();
    expect(dialogs.open()).toBe('recovery');
    expect(service.entries()).toHaveLength(2);
  });

  it('no offer without snapshots; a running app keeps its own', async () => {
    await service.offerAtStart();
    expect(dialogs.open()).toBeNull();
    rec.alive.add('00000000000000bb');
    const id = await crashed(CAM);
    const snap = rec.snapshots.get(id)!;
    rec.snapshots.delete(id);
    rec.plant({ path: snap.path, savedAt: snap.savedAt, file: snap.file }, '00000000000000bb');
    await service.show();
    expect(service.entries()).toEqual([]);
    await expect(rec.open('00000000000000bb-2')).rejects.toMatchObject({
      code: 'recovery_unavailable',
    });
  });

  it('restores as a changed document with the original path; saving writes the file', async () => {
    const id = await crashed(CAM);
    await service.offerAtStart();
    expect(await service.restore(id)).toBe(true);
    expect(dialogs.open()).toBeNull();
    const s = files.store()!;
    expect(s.document().path).toBe(CAM);
    expect(s.document().format).toBe('zip');
    expect(s.dirty()).toBe(true);
    expect(s.pristine()).toBe(false);
    expect(files.title()).toBe('camscanner.icon');
    expect([...s.document().assets.values()][0].svg!.root.getAttribute('opacity')).toBe('0.25');
    // the snapshot is this window's now (new id) – not offered again
    TestBed.tick();
    expect(service.currentId).not.toBe(id);
    expect(rec.snapshots.has(service.currentId!)).toBe(true);
    expect(await rec.list(false)).toEqual([]);
    // save: every asset in full (the file on disk is older), then the snapshot goes
    expect(await files.save()).toBe(true);
    const req = backend.files.saved.at(-1)!;
    expect(req.path).toBe(CAM);
    expect(req.assets.every((a) => !a.unchanged)).toBe(true);
    TestBed.tick();
    await Promise.resolve();
    expect(rec.snapshots.size).toBe(0);
    expect(backend.files.files.get(CAM)!.assets[0].text).toContain('opacity="0.25"');
  });

  it('a never saved document comes back untitled and asks for a path on save', async () => {
    const id = await crashed(null);
    expect(await service.restore(id)).toBe(true);
    const s = files.store()!;
    expect(s.document().path).toBeNull();
    expect(files.title()).toBe('Untitled');
    expect(s.dirty()).toBe(true);
    expect(s.pristine()).toBe(false); // Open does not replace it silently
  });

  it('asks about unsaved changes first; cancelled, the snapshot stays offered', async () => {
    const id = await crashed(CAM);
    change(files.store()!, '0.5');
    expect(await service.restore(id)).toBe(false);
    expect(asked).toHaveLength(1);
    expect(rec.snapshots.has(id)).toBe(true);
    expect((await rec.list(false)).map((e) => e.id)).toEqual([id]);
  });

  it('a snapshot taken elsewhere meanwhile: an error, the list is fresh', async () => {
    const id = await crashed(CAM);
    await service.show();
    rec.snapshots.delete(id);
    expect(await service.restore(id)).toBe(false);
    expect(asked).toEqual(['The document could not be recovered.']);
    expect(service.entries()).toEqual([]);
  });

  it('discard removes one', async () => {
    const id = await crashed(CAM);
    await service.show();
    await service.discard(id);
    expect(rec.snapshots.size).toBe(0);
    expect(service.entries()).toEqual([]);
  });
});
