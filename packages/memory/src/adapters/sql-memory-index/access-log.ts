/**
 * Pruning of the memory access log: the newest rows, within a retention window, per project.
 *
 * Why: every search, get and related call leaves a row so the owner can see what memory failed to answer, and
 *   a log that only grows would become the largest table in the database. It keeps the newest 20,000 rows and
 *   nothing older than 90 days per project, which is far more than a miss analysis needs. The server prunes
 *   once at start, before it listens.
 *
 * Exports: pruneAccessLog().
 * Depends on: @forge/core (types), types/sql-memory. IO: the injected storage only.
 */

import type { StorageAdapter } from '@forge/core';
import type { AccessLogSettings } from '#/types/sql-memory.types.js';

const DAY_MS = 86_400_000;
const DEFAULT_LOG: AccessLogSettings = { keepRows: 20_000, keepDays: 90 };

/** Drops access-log rows beyond the newest `keepRows` and older than `keepDays`, per project; returns how many. */
export async function pruneAccessLog(
  storage: StorageAdapter,
  projects: readonly string[],
  now: Date,
  settings: AccessLogSettings = DEFAULT_LOG,
): Promise<number> {
  const olderThan = new Date(now.getTime() - settings.keepDays * DAY_MS).toISOString();
  let dropped = 0;
  for (const project of projects) {
    dropped += await storage.transaction((tx) =>
      tx.memory.pruneAccess(project, settings.keepRows, olderThan),
    );
  }

  return dropped;
}
