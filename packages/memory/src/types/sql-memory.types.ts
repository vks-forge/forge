/**
 * SQL memory types — the dependencies of the database-backed memory and the row a write stores.
 *
 * Why: the database-backed `ProjectMemory` and `MemoryIndex` receive their storage and clock from the
 *   composition root and hold nothing else, so a test can run them on the in-memory storage and the server on
 *   SQLite with no change. A planned write is the same four things everywhere (row, tags, links and the
 *   history entry written with it), so the pure planners and the one door that stores them share one shape.
 *
 * Exports: SqlMemoryDeps, RowWrite, SqlIndexDeps, AccessLogSettings.
 * Depends on: @forge/core (types only). Types only.
 */

import type { MemoryLink, MemoryRow, NewMemoryEvent, StorageAdapter } from '@forge/core';

export interface SqlMemoryDeps {
  readonly storage: StorageAdapter;
  readonly now: () => Date;
}

/** What one write stores: the record, its tags and links, and the history entry written with it. */
export interface RowWrite {
  readonly row: MemoryRow;
  readonly tags: readonly string[];
  readonly links: readonly MemoryLink[];
  readonly event: NewMemoryEvent;
}

export interface SqlIndexDeps {
  readonly storage: StorageAdapter;
  readonly now: () => Date;
}

/** How much of the access log is kept per project. */
export interface AccessLogSettings {
  readonly keepRows: number;
  readonly keepDays: number;
}
