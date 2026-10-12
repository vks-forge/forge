/**
 * SqlDriver over better-sqlite3 with WAL, busy_timeout and cached statements.
 *
 * Why: d-0023 puts state in SQLite WAL with a single writer. better-sqlite3 ships a
 *   prebuilt win32-x64 binary, so it loads on this host with no compiler (see README
 *   driver decision). Pragmas are applied once per connection: busy_timeout first so
 *   the WAL switch itself can wait on a lock.
 *
 * Exports: openSqliteDriver().
 * Depends on: better-sqlite3, types/storage-driver.types. IO: opens the database file.
 */

import Database from 'better-sqlite3';
import type { SqlDriver, SqliteStorageOptions } from '#/types/storage-driver.types.js';

const DEFAULT_BUSY_TIMEOUT_MS = 5000;

/** Open a connection and configure it; `:memory:` and file paths both work. */
export function openSqliteDriver(
  path: string,
  opts: SqliteStorageOptions = {},
): SqlDriver {
  const db = new Database(path);
  const busy = Math.trunc(opts.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS);
  db.pragma(`busy_timeout = ${busy}`);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  const cache = new Map<string, Database.Statement>();
  const stmt = (sql: string): Database.Statement => {
    let s = cache.get(sql);
    if (!s) {
      s = db.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };

  return {
    exec: (sql) => {
      db.exec(sql);
    },
    run: (sql, params = []) => ({ changes: stmt(sql).run(...params).changes }),
    get: <T extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ) => stmt(sql).get(...params) as T | undefined,
    all: <T extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ) => stmt(sql).all(...params) as T[],
    close: () => {
      cache.clear();
      db.close();
    },
  };
}
