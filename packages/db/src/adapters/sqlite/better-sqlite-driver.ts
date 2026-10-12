/**
 * SqlDriver over better-sqlite3 with WAL, busy_timeout and cached statements.
 *
 * Why: the Director's state must survive crashes while the UI and other processes read
 *   during the single writer's work. SQLite in WAL mode gives both with no server to run
 *   on this Windows box (d-0023). better-sqlite3 ships a prebuilt win32-x64 binary, so
 *   it installs without a compiler. Pragmas are set once per connection with
 *   busy_timeout first, so a second connection waits for the writer's lock instead of
 *   failing immediately, even during the switch to WAL itself.
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
