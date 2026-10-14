/**
 * Contract cases for the run repository: round-trip, listing and optional columns.
 *
 * Why: a run row is the Director's record of one Worker attempt; the supervisor patches it
 * as the run progresses and must be able to clear a column it set earlier (a finished run
 * has no `pid`). A backend that treated `undefined` as "leave alone" would show stale
 * facts about a run that has ended (director-core.md §3).
 *
 * Exports: describeRunsContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { InvalidInputError } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import { makeRun } from '#tests/helpers/fixtures.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeRunsContract(getDb: () => StorageAdapter): void {
  const db: Pick<StorageAdapter, 'transaction'> = {
    transaction: (fn) => getDb().transaction(fn),
  };

  describe('runs', () => {
    it('stores the project of a run and lets it be cleared', async () => {
      await db.transaction((tx) => tx.runs.insert(makeRun('rp', { project: 'sf' })));
      expect((await db.transaction((tx) => tx.runs.get('rp')))?.project).toBe('sf');
      await db.transaction((tx) => tx.runs.update('rp', { project: undefined }));
      expect((await db.transaction((tx) => tx.runs.get('rp')))?.project).toBeUndefined();
    });

    it('round-trips a run, lists by ticket and applies updates', async () => {
      await db.transaction(async (tx) => {
        await tx.runs.insert(makeRun('r1'));
        await tx.runs.insert(makeRun('r2', { ticket_id: 'SF-2' }));
        await tx.runs.update('r1', {
          status: 'success',
          ended_at: '2026-10-13T01:00:00.000Z',
          cost_usd: 0.5,
          usage: { in: 1, out: 2, cachedIn: 3, cacheWrite: 4 },
        });
      });

      const { r1, list } = await db.transaction(async (tx) => ({
        r1: await tx.runs.get('r1'),
        list: await tx.runs.listByTicket('SF-1'),
      }));

      expect(r1).toMatchObject({
        status: 'success',
        cost_usd: 0.5,
        usage: { in: 1, out: 2, cachedIn: 3, cacheWrite: 4 },
      });

      expect(list.map((r) => r.id)).toEqual(['r1']);
    });
  });

  describe('optional run columns', () => {
    it('update clears an optional column given as undefined', async () => {
      await db.transaction(async (tx) => {
        await tx.runs.insert(makeRun('r1', { error_family: 'crash', cost_usd: 1 }));
        await tx.runs.update('r1', { error_family: undefined });
      });

      const got = await db.transaction((tx) => tx.runs.get('r1'));
      expect('error_family' in (got ?? {})).toBe(false);
      expect(got?.cost_usd).toBe(1);
    });

    it('update refuses to clear a required column', async () => {
      await db.transaction((tx) => tx.runs.insert(makeRun('r1')));
      const failure = await db
        .transaction((tx) => tx.runs.update('r1', { harness: undefined } as never))
        .catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(InvalidInputError);
    });
  });
}
