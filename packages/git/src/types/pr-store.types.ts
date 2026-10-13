/**
 * Type of the local host's pull-request record store.
 *
 * Why: the local GitHost reads and writes PR records through a small store so numbering
 *   and read-modify-write sequences are serialised in one place; the host depends on this
 *   shape, not on how records reach the disk.
 *
 * Exports: PrStore.
 * Depends on: schemas/pr-record. Types only.
 */

import type { PrRecord } from '#/schemas/pr-record.js';

export interface PrStore {
  /** Allocates the next number and stores the record built from it; `make` sees the existing records and may throw to refuse. */
  create(make: (n: number, existing: readonly PrRecord[]) => PrRecord): Promise<PrRecord>;
  get(n: number): Promise<PrRecord>;
  /** Every stored record, in no particular order. */
  all(): Promise<readonly PrRecord[]>;
  save(record: PrRecord): Promise<void>;
  /** Runs `fn` while holding the store lock, so a read-modify-write on a PR cannot interleave. */
  locked<T>(fn: () => Promise<T>): Promise<T>;
}
