/**
 * In-memory CatalogueStore: the test double and reference for the SQLite one.
 *
 * Why: server and route tests need a catalogue that changes mid-test without a database, and
 *   the contract (built-in catalogue as version 1, compare-and-swap saves, append-only
 *   history, unusable documents refused) must hold for the fake exactly as for SQLite, or
 *   tests would pass against behaviour production does not have. Nothing persists.
 *
 * Exports: createMemoryCatalogueStore().
 * Depends on: @forge/core, @forge/tools, shared/catalogue-rows. No IO.
 */

import { ConfigVersionConflictError } from '@forge/core';
import type { Clock } from '@forge/core';
import { BUILT_IN_CATALOGUE, SEED_AUTHOR, SEED_REASON } from '@forge/tools';
import type { CatalogueStore, CatalogueVersion } from '@forge/tools';
import { checkAppend } from '#/shared/catalogue-rows.js';

export function createMemoryCatalogueStore(
  clock: Pick<Clock, 'now'> = Date,
): CatalogueStore {
  const rows: CatalogueVersion[] = [
    {
      version: 1,
      doc: structuredClone(BUILT_IN_CATALOGUE),
      author: SEED_AUTHOR,
      reason: SEED_REASON,
      created_at: clock.now(),
    },
  ];

  const latest = (): CatalogueVersion => {
    const row = rows.at(-1);
    if (!row) {
      throw new Error('catalogue lost its seed version');
    }

    return row;
  };

  return {
    current: async () => structuredClone(latest()),

    history: async () => structuredClone(rows),

    append: async (input) => {
      const req = checkAppend(input);
      const current = latest().version;
      if (current !== req.expectedVersion) {
        throw new ConfigVersionConflictError(req.expectedVersion, current);
      }

      const saved: CatalogueVersion = {
        version: current + 1,
        doc: structuredClone(req.doc),
        author: req.author,
        reason: req.reason,
        created_at: clock.now(),
      };

      rows.push(saved);

      return structuredClone(saved);
    },
  };
}
