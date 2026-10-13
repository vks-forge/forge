/**
 * SqliteBackend: storage and receipt log opened together on one SQLite connection.
 *
 * Why: the Forge server needs both the Director's storage and the tool receipt log, and
 *   on SQLite they write through a single connection. Handing them out as a pair that
 *   was built on one writer queue means no caller can wire them to separate queues by
 *   mistake and let a receipt append run in the middle of a Director transaction.
 *
 * Exports: SqliteBackend.
 * Depends on: @forge/core (StorageAdapter), @forge/tools (ReceiptLog). Types only.
 */

import type { StorageAdapter } from '@forge/core';
import type { ReceiptLog } from '@forge/tools';

export interface SqliteBackend {
  /** `close()` also closes the shared connection, after queued work finishes. */
  readonly storage: StorageAdapter;
  readonly receipts: ReceiptLog;
}
