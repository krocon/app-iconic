import { Injectable } from '@angular/core';
import { call } from '../backend/call';
import { Recovered, RecoveryEntry, WriteRecoveryRequest } from './recovery.models';

/** Typed facade of the recovery commands (prompt 083). Tests use `FakeRecoveryApi`. */
export abstract class RecoveryApi {
  /** Writes the snapshot (atomically); returns its id (a new one when `id` is `null`). */
  abstract write(request: WriteRecoveryRequest): Promise<string>;
  /**
   * Snapshots of apps that are gone, newest first. `atStart`: the offer at start – only the first
   * window of the app gets the list.
   */
  abstract list(atStart: boolean): Promise<RecoveryEntry[]>;
  /** Restores a listed snapshot; it then belongs to this app under the returned id. */
  abstract open(id: string): Promise<Recovered>;
  /** Removes a snapshot; `false` if there was none. */
  abstract discard(id: string): Promise<boolean>;
}

@Injectable()
export class TauriRecoveryApi extends RecoveryApi {
  /** The bridge (`call.ts`); a test replaces it to check the argument names. */
  protected backend: typeof call = call;

  write(r: WriteRecoveryRequest): Promise<string> {
    return this.backend<string>('write_recovery', {
      id: r.id,
      path: r.path,
      from: r.from,
      format: r.format,
      iconJson: r.iconJson,
      assets: r.assets,
    });
  }

  list(atStart: boolean): Promise<RecoveryEntry[]> {
    return this.backend<RecoveryEntry[]>('list_recovery', { atStart });
  }

  open(id: string): Promise<Recovered> {
    return this.backend<Recovered>('open_recovery', { id });
  }

  discard(id: string): Promise<boolean> {
    return this.backend<boolean>('discard_recovery', { id });
  }
}
