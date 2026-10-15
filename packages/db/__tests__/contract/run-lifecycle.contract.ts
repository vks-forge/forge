/**
 * Contract cases for the run lifecycle columns and the never-reopen rule.
 *
 * Why: restart reconciliation, the stall scan and resume all work from the `runs` row.
 * They need to know which server instance owns a run (`owner`, `pid`), when it last
 * produced anything (`last_event_at`), which hashes it ran under, and which statuses it
 * has passed through. A resumed run must be a new row linked by `retry_of`, never the old
 * row reopened, or the evidence of the first attempt (its end time, its chain hash) would
 * be overwritten. A run the server stopped under is the one thing resumed on its own row:
 * it goes `interrupted` (keeping its session and end-less state) and comes back `running`
 * with the next secret generation, or is given up as `settled`; it can never jump straight
 * to a result. These cases pin that on every backend (execution-plane.md §8, d-0092).
 *
 * Exports: describeRunLifecycleContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { InvalidInputError, RunStatus } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import { T0, makeRun } from '#tests/helpers/fixtures.js';

const T1 = '2026-10-13T01:00:00.000Z';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeRunLifecycleContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('run lifecycle', () => {
    const lifecycle = {
      pid: 4242,
      last_event_at: T1,
      final_chain_hash: 'b'.repeat(64),
      catalogue_hash: 'c'.repeat(64),
      prompt_hash: 'd'.repeat(64),
      config_version: 'c3:p1',
      retry_of: 'r0',
      hook_registered_at: T1,
    };

    it('round-trips owner and every optional lifecycle column', async () => {
      await tx((t) => t.runs.insert(makeRun('r1', { owner: 'srv-9', ...lifecycle })));
      expect(await tx((t) => t.runs.get('r1'))).toEqual(
        makeRun('r1', { owner: 'srv-9', ...lifecycle }),
      );
    });

    it('updates the lifecycle columns and clears the nullable ones with undefined', async () => {
      await tx(async (t) => {
        await t.runs.insert(makeRun('r1', { status: 'starting' }));
        await t.runs.update('r1', { status: 'running', pid: 77, hook_registered_at: T1 });
        await t.runs.update('r1', {
          last_event_at: T1,
          final_chain_hash: 'e'.repeat(64),
        });
      });

      expect(await tx((t) => t.runs.get('r1'))).toMatchObject({
        status: 'running',
        pid: 77,
        hook_registered_at: T1,
        last_event_at: T1,
        final_chain_hash: 'e'.repeat(64),
      });

      await tx((t) =>
        t.runs.update('r1', { pid: undefined, hook_registered_at: undefined }),
      );

      const got = await tx((t) => t.runs.get('r1'));
      expect('pid' in (got ?? {})).toBe(false);
      expect('hook_registered_at' in (got ?? {})).toBe(false);
    });

    it('owner is required and cannot be cleared', async () => {
      const bad = await tx((t) =>
        t.runs.insert({ ...makeRun('r1'), owner: undefined } as never),
      ).catch((e: unknown) => e);

      await tx((t) => t.runs.insert(makeRun('r2')));
      const clear = await tx((t) =>
        t.runs.update('r2', { owner: undefined } as never),
      ).catch((e: unknown) => e);

      expect(bad).toBeInstanceOf(InvalidInputError);
      expect(clear).toBeInstanceOf(InvalidInputError);
    });

    it('stores every RunStatus', async () => {
      for (const [i, status] of RunStatus.options.entries()) {
        await tx((t) => t.runs.insert(makeRun(`r${i}`, { status })));
      }

      const all = await tx((t) => t.runs.listByStatus(RunStatus.options));
      expect(all.map((r) => r.status)).toEqual([...RunStatus.options]);
    });

    it('listByStatus returns only the given statuses, oldest first; none given means none', async () => {
      await tx(async (t) => {
        await t.runs.insert(makeRun('r1', { status: 'running' }));
        await t.runs.insert(makeRun('r2', { status: 'success', ended_at: T1 }));
        await t.runs.insert(makeRun('r3', { status: 'starting' }));
        await t.runs.insert(makeRun('r4', { status: 'running' }));
      });

      const active = await tx((t) => t.runs.listByStatus(['starting', 'running']));
      const none = await tx((t) => t.runs.listByStatus([]));
      expect(active.map((r) => r.id)).toEqual(['r1', 'r3', 'r4']);
      expect(none).toEqual([]);
    });

    it('resume is a new row: the old run keeps its end time and the new one points back with retry_of', async () => {
      await tx(async (t) => {
        await t.runs.insert(makeRun('r1', { status: 'running' }));
        await t.runs.update('r1', { status: 'success', ended_at: T1 });
        await t.runs.insert(makeRun('r2', { retry_of: 'r1', started_at: T1 }));
      });

      const list = await tx((t) => t.runs.listByTicket('SF-1'));
      expect(list.map((r) => [r.id, r.status, r.retry_of, r.ended_at])).toEqual([
        ['r1', 'success', undefined, T1],
        ['r2', 'running', 'r1', undefined],
      ]);
    });

    describe('interrupted runs (d-0092)', () => {
      it('round-trips generation, resumable_session and interrupted_at; generation defaults to 1', async () => {
        await tx(async (t) => {
          await t.runs.insert(makeRun('r1'));
          await t.runs.update('r1', {
            status: 'interrupted',
            resumable_session: 'sess-1',
            interrupted_at: T1,
          });
        });

        expect(await tx((t) => t.runs.get('r1'))).toMatchObject({
          status: 'interrupted',
          generation: 1,
          resumable_session: 'sess-1',
          interrupted_at: T1,
        });
      });

      it('resumes on the same row: running again with the next generation and the markers cleared', async () => {
        await tx(async (t) => {
          await t.runs.insert(makeRun('r1'));
          await t.runs.update('r1', { status: 'interrupted', interrupted_at: T1 });
          await t.runs.update('r1', {
            status: 'running',
            generation: 2,
            interrupted_at: undefined,
            resumable_session: undefined,
          });
        });

        const got = await tx((t) => t.runs.get('r1'));
        expect(got).toMatchObject({ status: 'running', generation: 2 });
        expect('interrupted_at' in (got ?? {})).toBe(false);
        expect(got?.ended_at).toBeUndefined();
      });

      it('gives up as settled with an end time and an error family', async () => {
        await tx(async (t) => {
          await t.runs.insert(makeRun('r1'));
          await t.runs.update('r1', { status: 'interrupted' });
          await t.runs.update('r1', {
            status: 'settled',
            ended_at: T1,
            error_family: 'crash',
          });
        });

        expect(await tx((t) => t.runs.get('r1'))).toMatchObject({
          status: 'settled',
          ended_at: T1,
          error_family: 'crash',
        });
      });

      it.each(['success', 'error', 'settling', 'cancelled'] as const)(
        'refuses interrupted -> %s',
        async (status) => {
          await tx(async (t) => {
            await t.runs.insert(makeRun('r1'));
            await t.runs.update('r1', { status: 'interrupted' });
          });

          const failure = await tx((t) => t.runs.update('r1', { status })).catch(
            (e: unknown) => e,
          );

          expect(failure).toBeInstanceOf(InvalidInputError);
          expect((await tx((t) => t.runs.get('r1')))?.status).toBe('interrupted');
        },
      );

      it('refuses interrupting a run that already ended', async () => {
        await tx((t) =>
          t.runs.insert(makeRun('r1', { status: 'success', ended_at: T1 })),
        );

        const failure = await tx((t) =>
          t.runs.update('r1', { status: 'interrupted' }),
        ).catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(InvalidInputError);
      });

      it('interrupted runs are found by listByStatus for the restart scan', async () => {
        await tx(async (t) => {
          await t.runs.insert(makeRun('r1'));
          await t.runs.insert(makeRun('r2'));
          await t.runs.update('r2', { status: 'interrupted' });
        });

        const found = await tx((t) => t.runs.listByStatus(['interrupted']));
        expect(found.map((r) => r.id)).toEqual(['r2']);
      });
    });

    describe('a run with ended_at is never reopened', () => {
      const ended = () =>
        tx((t) => t.runs.insert(makeRun('r1', { status: 'settling', ended_at: T1 })));

      it.each(['starting', 'running'] as const)('refuses status %s', async (status) => {
        await ended();
        const failure = await tx((t) => t.runs.update('r1', { status })).catch(
          (e: unknown) => e,
        );

        expect(failure).toBeInstanceOf(InvalidInputError);
        expect((await tx((t) => t.runs.get('r1')))?.status).toBe('settling');
      });

      it('refuses clearing ended_at', async () => {
        await ended();
        const failure = await tx((t) =>
          t.runs.update('r1', { ended_at: undefined }),
        ).catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(InvalidInputError);
        expect((await tx((t) => t.runs.get('r1')))?.ended_at).toBe(T1);
      });

      it('still lets the reconcile hand-off and late evidence through', async () => {
        await ended();
        await tx((t) =>
          t.runs.update('r1', { status: 'settled', final_chain_hash: 'e'.repeat(64) }),
        );

        expect(await tx((t) => t.runs.get('r1'))).toMatchObject({
          status: 'settled',
          ended_at: T1,
          final_chain_hash: 'e'.repeat(64),
        });
      });

      it('lets a run that has not ended go starting -> running -> success with ended_at', async () => {
        await tx(async (t) => {
          await t.runs.insert(makeRun('r2', { status: 'starting', started_at: T0 }));
          await t.runs.update('r2', { status: 'running' });
          await t.runs.update('r2', { status: 'success', ended_at: T1 });
        });

        expect(await tx((t) => t.runs.get('r2'))).toMatchObject({
          status: 'success',
          ended_at: T1,
        });
      });
    });
  });
}
