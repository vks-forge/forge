/**
 * SqliteBackend: storage and receipt log opened together on one SQLite connection.
 *
 * Why: the Forge server needs the Director's storage, the tool receipt log and the
 *   versioned settings, and on SQLite they write through a single connection. Handing
 *   them out together, built on one writer queue, means no caller can wire them to
 *   separate queues by mistake and let a receipt append or a settings save run in the
 *   middle of a Director transaction.
 *
 * Exports: SqliteBackend.
 * Depends on: @forge/core (StorageAdapter, ConfigSource), @forge/tools (ReceiptLog). Types only.
 */

import type { ConfigSource, StorageAdapter } from '@forge/core';
import type { ReceiptLog } from '@forge/tools';

export interface SqliteBackend {
  /** `close()` also closes the shared connection, after queued work finishes. */
  readonly storage: StorageAdapter;
  readonly receipts: ReceiptLog;
  /** Versioned settings on the same connection and writer queue. */
  readonly config: ConfigSource;
}
