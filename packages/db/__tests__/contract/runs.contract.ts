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

  describe('agent record', () => {
    it('stores the agent id and hash of a run and lets them be absent on older runs', async () => {
      const hash = 'a'.repeat(64);
      await db.transaction(async (tx) => {
        await tx.runs.insert(
          makeRun('ra', { agent_id: 'implementer', agent_hash: hash }),
        );

        await tx.runs.insert(makeRun('rb'));
      });

      const got = await db.transaction(async (tx) => ({
        a: await tx.runs.get('ra'),
        b: await tx.runs.get('rb'),
      }));

      expect(got.a).toMatchObject({ agent_id: 'implementer', agent_hash: hash });
      expect('agent_id' in (got.b ?? {})).toBe(false);
      expect('agent_hash' in (got.b ?? {})).toBe(false);
    });

    it('lets a patch set and clear the agent record', async () => {
      await db.transaction(async (tx) => {
        await tx.runs.insert(makeRun('rc'));
        await tx.runs.update('rc', { agent_id: 'reviewer', agent_hash: 'b'.repeat(64) });
      });

      expect((await db.transaction((tx) => tx.runs.get('rc')))?.agent_id).toBe(
        'reviewer',
      );

      await db.transaction((tx) => tx.runs.update('rc', { agent_id: undefined }));
      expect(
        'agent_id' in ((await db.transaction((tx) => tx.runs.get('rc'))) ?? {}),
      ).toBe(false);
    });
  });

  describe('fallback record', () => {
    it('stores the model and fallback slot of a run, absent on older runs, and lets a patch change them', async () => {
      await db.transaction(async (tx) => {
        await tx.runs.insert(makeRun('rm', { model: 'sonnet', fallback_slot: 1 }));
        await tx.runs.insert(makeRun('rn'));
        await tx.runs.insert(makeRun('rs', { fallback_slot: -1 }));
      });

      const got = await db.transaction(async (tx) => ({
        m: await tx.runs.get('rm'),
        n: await tx.runs.get('rn'),
        s: await tx.runs.get('rs'),
      }));

      expect(got.m).toMatchObject({ model: 'sonnet', fallback_slot: 1 });
      expect('model' in (got.n ?? {})).toBe(false);
      expect('fallback_slot' in (got.n ?? {})).toBe(false);
      expect(got.s?.fallback_slot).toBe(-1);

      await db.transaction((tx) =>
        tx.runs.update('rn', { model: 'opus', fallback_slot: 0 }),
      );

      expect(await db.transaction((tx) => tx.runs.get('rn'))).toMatchObject({
        model: 'opus',
        fallback_slot: 0,
      });
    });

    it('lists the runs of the tickets asked for, oldest first', async () => {
      await db.transaction(async (tx) => {
        await tx.runs.insert(makeRun('a1', { ticket_id: 'SF-1' }));
        await tx.runs.insert(makeRun('b1', { ticket_id: 'SF-2' }));
        await tx.runs.insert(makeRun('a2', { ticket_id: 'SF-1' }));
        await tx.runs.insert(makeRun('c1', { ticket_id: 'SF-3' }));
      });

      const got = await db.transaction((tx) => tx.runs.listByTickets(['SF-1', 'SF-2']));

      expect(got.map((r) => r.id)).toEqual(['a1', 'b1', 'a2']);
      expect(await db.transaction((tx) => tx.runs.listByTickets([]))).toEqual([]);
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
