/**
 * Migration shape.
 *
 * Why: a migration is just an ordered id, a name and SQL, and the runner checksums the
 *   SQL. Keeping the shape this small makes history easy to audit and impossible to make
 *   conditional or environment-dependent: the same migrations produce the same schema
 *   everywhere.
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
