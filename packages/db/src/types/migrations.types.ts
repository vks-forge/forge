/**
 * Migration shape.
 *
 * Why: a migration is just an ordered id, a name and SQL, and the runner checksums the
 *   SQL. Keeping the shape this small makes history easy to audit and impossible to make
 *   conditional or environment-dependent: the same migrations produce the same schema
 *   everywhere.
 *
 * Exports: Migration, SchemaReport.
 * Depends on: nothing. Types only.
 */

/** One forward-only schema change; `id` is strictly increasing and never reused. */
export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

/** What `checkSchemaCurrent` found: `current` matches this build, `behind` has pending migrations, `ahead` holds migrations this build does not know, `edited` has an applied migration whose SQL changed. */
export interface SchemaReport {
  readonly status: 'current' | 'behind' | 'ahead' | 'edited';
  /** Registry ids not yet applied. */
  readonly pending: readonly number[];
  /** Applied ids missing from the registry (database newer than this build). */
  readonly unknown: readonly number[];
  /** Applied ids whose checksum differs from the registry. */
  readonly edited: readonly number[];
}
