/**
 * Migration shape.
 *
 * Why: migrations are forward-only, numbered SQL scripts applied once each
 *   (m0-brief.md Slice 1); the runner needs only an id, a name and the SQL.
 *
 * Exports: Migration.
 * Depends on: nothing. Types only.
 */

/** One forward-only schema change; `id` is strictly increasing and never reused. */
export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}
