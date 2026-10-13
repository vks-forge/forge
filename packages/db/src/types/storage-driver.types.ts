/**
 * SqlDriver: the minimal synchronous SQL surface the sqlite adapter runs on.
 *
 * Why: repositories and migrations are written once against a small synchronous SQL
 *   surface, so the engine underneath (better-sqlite3, or node:sqlite as a fallback if
 *   the native binary ever fails on a host) can be swapped without rewriting them. A
 *   minimal surface keeps that swap realistic. The in-memory adapter does not use it: it
 *   implements `StorageAdapter` directly and shares only the contract test (d-0023).
 *
 * Exports: SqlValue, SqlRunResult, SqlDriver, SqliteStorageOptions, SqlRow, ColumnCodec.
 * Depends on: nothing. Types only.
 */

/** A value bindable as a SQL parameter. */
export type SqlValue = string | number | bigint | null | Uint8Array;

/** Result of a write statement. */
export interface SqlRunResult {
  /** Rows inserted, updated or deleted by the statement. */
  readonly changes: number;
}

/** A raw result row before zod parsing at the repository boundary. */
export type SqlRow = Record<string, unknown>;

/** Synchronous SQL execution; one connection, one writer. */
export interface SqlDriver {
  /** Run one or more statements with no parameters or result (DDL, BEGIN, COMMIT). */
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): SqlRunResult;
  get<T extends SqlRow = SqlRow>(
    sql: string,
    params?: readonly SqlValue[],
  ): T | undefined;
  all<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]): T[];
  close(): void;
}

/** Options for `createSqliteStorage` / `openSqliteDriver`. */
export interface SqliteStorageOptions {
  /** How long a writer waits on a locked database before SQLITE_BUSY. Default 5000. */
  readonly busyTimeoutMs?: number;
}

/** Maps one domain field to its column and how its value is encoded for binding. */
export interface ColumnCodec {
  readonly column: string;
  readonly encode?: (value: unknown) => SqlValue;
  /** True for optional fields: a patch value of `undefined` sets the column to NULL. */
  readonly clearable?: true;
}
