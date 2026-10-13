/**
 * Row helpers shared by the in-memory repositories.
 *
 * Why: every in-memory repository must behave like its SQLite twin on two small points,
 *   or the engine tests that run on memory would pass on behaviour production lacks. A
 *   duplicate primary key is an `InvalidInputError` (SQLite's constraint violation, mapped
 *   at the boundary), and a cleared optional column reads back as an absent key (SQLite
 *   returns NULL, which the read path drops), whereas zod would keep a present-but-undefined
 *   key.
 *
 * Exports: insertUnique(), withoutUndefined().
 * Depends on: @forge/core (InvalidInputError). No IO.
 */

import { InvalidInputError } from '@forge/core';

/** Store `value` under `id`, or throw `InvalidInputError` when the key is taken. */
export function insertUnique<T>(
  map: Map<string, T>,
  id: string,
  value: T,
  what: string,
): void {
  if (map.has(id)) throw new InvalidInputError(`Duplicate ${what}: ${id}`);
  map.set(id, value);
}

/** The row without present-but-undefined keys, so it reads back like a SQLite row. */
export function withoutUndefined<T extends object>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as T;
}
