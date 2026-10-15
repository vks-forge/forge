/**
 * A SecretStore wrapper that remembers every secret written through it.
 *
 * Why: run secrets are deleted as soon as a run is over (d-0100), but the end-to-end tests
 *   and the probes verify a finished run's receipt chain after the fact and want to check the
 *   secrets really were deleted. Recording what was written lets them re-verify the chain with
 *   the very secrets the server used, while `list` and `get` still show what the store holds
 *   now, so "deleted at the end" stays assertable.
 *
 * Exports: RecordingSecrets, createRecordingSecrets().
 * Depends on: @forge/core (SecretStore). IO only through the wrapped store.
 */

import type { SecretStore } from '@forge/core';

export interface RecordingSecrets extends SecretStore {
  /** Every secret ever written, by name, with the latest bytes written under it. */
  readonly written: ReadonlyMap<string, Uint8Array>;
  /** The text of generation `generation`'s secret of `runId` as it was written; null when none was. */
  secretOf(runId: string, generation: number): string | null;
}

export function createRecordingSecrets(inner: SecretStore): RecordingSecrets {
  const written = new Map<string, Uint8Array>();

  return {
    written,
    get: (name) => inner.get(name),
    async put(name, bytes) {
      written.set(name, new Uint8Array(bytes));
      await inner.put(name, bytes);
    },
    delete: (name) => inner.delete(name),
    list: (prefix) => inner.list(prefix),
    secretOf(runId, generation) {
      const bytes = written.get(`run/${runId}/secret-g${generation}`);

      return bytes ? Buffer.from(bytes).toString('utf8') : null;
    },
  };
}
