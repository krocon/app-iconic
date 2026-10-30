import { FsError } from '../app/core/errors/fs-error';
import { IconJson } from '../app/core/icon-file/icon-file.models';
import { RecoveryApi } from '../app/core/recovery/recovery-api';
import {
  Recovered,
  RecoveryEntry,
  WriteRecoveryRequest,
} from '../app/core/recovery/recovery.models';
import { FakeIconFile, FakeIconFileApi, fakeName } from './fake-icon-file-api';

/** Where the browser mode keeps its "recovery folder" (a reload = the app was killed). */
export const FAKE_RECOVERY_KEY = 'appIconic.recovery';

/** One snapshot of the fake: what Rust keeps in `meta.json` + `snapshot.icon`. */
export interface FakeSnapshot {
  id: string;
  path: string | null;
  savedAt: number;
  file: FakeIconFile;
}

function error(code: FsError['code'], message: string): FsError {
  return { code, message, path: null };
}

function randomInstance(): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

const instanceOf = (id: string): string | null => /^([0-9a-f]{16})-\d{1,10}$/.exec(id)?.[1] ?? null;

/**
 * Test double of {@link RecoveryApi} with the rules of Rust `ai_core::recovery` (prompt 083):
 * ids `<instance>-<n>`, this fake is one instance; snapshots of other instances count as gone
 * unless listed in `alive`. Unchanged assets come from the sessions of the {@link FakeIconFileApi}.
 * With a `Storage` (browser mode) the snapshots survive a reload – the "crash" of the e2e test.
 */
export class FakeRecoveryApi extends RecoveryApi {
  readonly instance = randomInstance();
  /** Other running instances: their snapshots are neither listed nor taken. */
  readonly alive = new Set<string>();
  readonly snapshots = new Map<string, FakeSnapshot>();
  readonly writes: WriteRecoveryRequest[] = [];
  readonly discards: string[] = [];
  /** The next `write` fails with this error. */
  failNext: FsError | null = null;
  now = () => Date.now();
  private offered = false;
  private seq = 0;

  constructor(
    private readonly files: FakeIconFileApi,
    private readonly storage: Storage | null = null,
  ) {
    super();
    try {
      const text = storage?.getItem(FAKE_RECOVERY_KEY);
      for (const s of text ? (JSON.parse(text) as FakeSnapshot[]) : []) {
        if (instanceOf(s.id)) this.snapshots.set(s.id, s);
      }
    } catch {
      // a broken entry: no snapshots
    }
  }

  /** A snapshot of another (gone) instance – what a crash left (tests). */
  plant(snapshot: Omit<FakeSnapshot, 'id'>, instance = '00000000000000aa'): string {
    const id = `${instance}-${++this.seq}`;
    this.snapshots.set(id, { ...snapshot, id });
    this.persist();
    return id;
  }

  private persist(): void {
    try {
      this.storage?.setItem(FAKE_RECOVERY_KEY, JSON.stringify([...this.snapshots.values()]));
    } catch {
      // storage full or blocked: memory only
    }
  }

  private gone(id: string): boolean {
    const inst = instanceOf(id);
    return inst !== null && inst !== this.instance && !this.alive.has(inst);
  }

  async write(r: WriteRecoveryRequest): Promise<string> {
    const e = this.failNext;
    this.failNext = null;
    if (e) throw e;
    this.writes.push(structuredClone(r));
    if (r.id !== null && instanceOf(r.id) !== this.instance) {
      throw error('not_allowed', 'not a snapshot of this app');
    }
    const id = r.id ?? `${this.instance}-${++this.seq}`;
    const file = this.files.assemble({ ...r, path: r.path ?? '' });
    this.snapshots.set(id, { id, path: r.path, savedAt: this.now(), file });
    this.persist();
    return id;
  }

  async list(atStart: boolean): Promise<RecoveryEntry[]> {
    if (atStart && this.offered) return [];
    this.offered = true;
    return [...this.snapshots.values()]
      .filter((s) => this.gone(s.id))
      .sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id))
      .map((s) => ({
        id: s.id,
        path: s.path,
        name: s.path === null ? null : fakeName(s.path),
        location: s.path === null ? null : s.path.slice(0, -fakeName(s.path).length - 1),
        savedAt: s.savedAt,
      }));
  }

  async open(id: string): Promise<Recovered> {
    const s = this.snapshots.get(id);
    if (!s || !this.gone(id)) throw error('recovery_unavailable', `no snapshot ${id}`);
    this.snapshots.delete(id);
    const taken = { ...s, id: `${this.instance}-${++this.seq}` };
    this.snapshots.set(taken.id, taken);
    this.persist();
    if (s.path !== null) this.files.adoptSession(s.path, s.file);
    return {
      id: taken.id,
      document: {
        path: s.path,
        name: s.path === null ? null : fakeName(s.path),
        format: s.file.format,
        iconJson: JSON.parse(s.file.iconJson) as IconJson,
        assets: s.file.assets.map((a) => ({ ...a })),
        warnings: [],
      },
    };
  }

  async discard(id: string): Promise<boolean> {
    const inst = instanceOf(id);
    if (inst === null) throw error('invalid_request', 'invalid recovery id');
    if (inst !== this.instance && this.alive.has(inst)) throw error('not_allowed', 'in use');
    this.discards.push(id);
    const had = this.snapshots.delete(id);
    this.persist();
    return had;
  }
}
