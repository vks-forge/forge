/**
 * Contract cases for a ticket's stage rows (snapshots: ticket-pipelines.contract.ts, artifacts: stage-artifacts.contract.ts).
 *
 * Why: the stage runner keeps no cursor, so these three repositories are the whole account of
 *   where a ticket's pipeline stands, and both storage backends must give the same answers. The
 *   first snapshot of a ticket must stand (a later settings edit can never change a started
 *   ticket), a stage attempt must be unique per ticket, stage, member and cycle (that is what
 *   makes a restart or a double tick start nothing twice), an attempt must be findable by the run
 *   that carries it, outcomes must be validated both ways, and artifacts must list without their
 *   content and be read only through their own ticket.
 *
 * Exports: describeStageRunnerContract(), attempt().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { StorageAdapter, TicketId } from '@forge/core';
import { T0, makeTicket } from '#tests/helpers/fixtures.js';

const T1 = '2026-10-13T01:00:00.000Z';

export const attempt = (
  id: string,
  stage: string,
  over: Record<string, unknown> = {},
) => ({
  ticket_id: id as TicketId,
  stage_id: stage,
  member_id: '',
  cycle: 0,
  kind: 'agent' as const,
  status: 'running' as const,
  started_at: T0,
  ...over,
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeStageRunnerContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);
  const seedTicket = (n = 1) => tx((t) => t.tickets.insert(makeTicket(n)));
  const TID = makeTicket(1).id;

  describe('stage runs', () => {
    it('starts an attempt once: the same ticket, stage, member and cycle reports exists', async () => {
      await seedTicket();

      const a = await tx((t) => t.stageRuns.start(attempt(TID, 'implementer')));
      const b = await tx((t) => t.stageRuns.start(attempt(TID, 'implementer')));
      const otherCycle = await tx((t) =>
        t.stageRuns.start(attempt(TID, 'implementer', { cycle: 1 })),
      );

      const otherMember = await tx((t) =>
        t.stageRuns.start(attempt(TID, 'implementer', { member_id: 'proof' })),
      );

      expect(typeof a).toBe('number');
      expect(b).toBe('exists');
      expect(typeof otherCycle).toBe('number');
      expect(typeof otherMember).toBe('number');
      expect(new Set([a, otherCycle, otherMember]).size).toBe(3);
    });

    it("lists a ticket's attempts oldest first with an empty outcome, and finds one by its key", async () => {
      await seedTicket();
      await tx(async (t) => {
        await t.stageRuns.start(
          attempt(TID, 'test-writer', { agent_id: 'test-writer', run_id: 'r1' }),
        );

        await t.stageRuns.start(
          attempt(TID, 'implementer', { agent_id: 'implementer', run_id: 'r2' }),
        );
      });

      const rows = await tx((t) => t.stageRuns.listByTicket(TID));
      const found = await tx((t) => t.stageRuns.find(TID, 'implementer', '', 0));

      expect(rows.map((r) => r.stage_id)).toEqual(['test-writer', 'implementer']);
      expect(rows[0]).toMatchObject({ status: 'running', outcome: {}, run_id: 'r1' });
      expect(found).toMatchObject({ stage_id: 'implementer', agent_id: 'implementer' });
      expect(await tx((t) => t.stageRuns.find(TID, 'implementer', '', 5))).toBeNull();
    });

    it('finds an attempt by the run that carries it, and the newest when a run was linked twice', async () => {
      await seedTicket();
      const id = (await tx((t) =>
        t.stageRuns.start(attempt(TID, 'reviewer', { run_id: 'run-3' })),
      )) as number;

      expect(await tx((t) => t.stageRuns.getByRun('run-3'))).toMatchObject({
        id,
        stage_id: 'reviewer',
      });

      expect(await tx((t) => t.stageRuns.getByRun('nope'))).toBeNull();

      await tx((t) => t.stageRuns.finish(id, { run_id: 'run-4' }));

      expect(await tx((t) => t.stageRuns.getByRun('run-3'))).toBeNull();
      expect(await tx((t) => t.stageRuns.getByRun('run-4'))).toMatchObject({ id });
    });

    it('finishes an attempt with status, outcome and end time, changing only what it is given', async () => {
      await seedTicket();
      const id = (await tx((t) =>
        t.stageRuns.start(
          attempt(TID, 'reviewer', { agent_id: 'reviewer', run_id: 'r9' }),
        ),
      )) as number;

      const review = {
        verdict: 'changes' as const,
        summary: 'one problem',
        findings: [{ severity: 'high' as const, issue: 'bug', evidence: 'a.ts:1 `x`' }],
      };

      await tx((t) =>
        t.stageRuns.finish(id, {
          status: 'failed',
          outcome: { review, blocking: 1 },
          ended_at: T1,
        }),
      );

      const row = await tx((t) => t.stageRuns.find(TID, 'reviewer', '', 0));

      expect(row).toMatchObject({
        status: 'failed',
        agent_id: 'reviewer',
        run_id: 'r9',
        ended_at: T1,
        outcome: { review, blocking: 1 },
      });

      await tx((t) => t.stageRuns.finish(id, { status: 'running', ended_at: null }));

      expect(
        (await tx((t) => t.stageRuns.find(TID, 'reviewer', '', 0)))?.ended_at,
      ).toBeUndefined();
    });

    it('refuses an unknown attempt, an outcome that breaks the schema and an unknown status', async () => {
      await seedTicket();
      const id = (await tx((t) =>
        t.stageRuns.start(attempt(TID, 'implementer')),
      )) as number;

      await expect(
        tx((t) => t.stageRuns.finish(9999, { status: 'passed' })),
      ).rejects.toThrow();

      await expect(
        tx((t) =>
          t.stageRuns.finish(id, { outcome: { review: { verdict: 'maybe' } } as never }),
        ),
      ).rejects.toThrow();

      await expect(
        tx((t) => t.stageRuns.start(attempt(TID, 'x', { status: 'bogus' }) as never)),
      ).rejects.toThrow();
    });

    it('keeps tickets apart', async () => {
      await seedTicket(1);
      await seedTicket(2);
      const other = makeTicket(2).id;
      await tx(async (t) => {
        await t.stageRuns.start(attempt(TID, 'implementer'));
        await t.stageRuns.start(attempt(other, 'implementer'));
      });

      expect(await tx((t) => t.stageRuns.listByTicket(TID))).toHaveLength(1);
      expect(await tx((t) => t.stageRuns.listByTicket(other))).toHaveLength(1);
    });

    it('rolls back with its transaction', async () => {
      await seedTicket();

      await expect(
        tx(async (t) => {
          await t.stageRuns.start(attempt(TID, 'implementer'));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await tx((t) => t.stageRuns.listByTicket(TID))).toEqual([]);
    });
  });
}
