/**
 * Contract cases for pipeline proposals and the owner's finding marks.
 *
 * Why: a proposal asks the owner to edit a project's lane, so the store must never let the same change be
 *   proposed twice for the same base list (whatever the owner decided about it: that is how a rejection
 *   suppresses a key for good and how a repeated snapshot or a restart proposes nothing twice), must let
 *   exactly one of two racing decisions win, and must keep a project's proposals apart from another's. The
 *   owner's mark on a finding is the one direct judgement scorecards have: one row per (stage row, finding),
 *   a second mark replaces the first, clearing reports whether there was one. Both backends are held to
 *   the same answers; purging a project takes its proposals and marks with it and nothing of another's.
 *
 * Exports: describePipelineProposalsContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '@forge/core';
import type { NewPipelineProposal, StorageAdapter } from '@forge/core';
import { T0, makeProject, makeTicket } from '#tests/helpers/fixtures.js';

const T1 = '2026-10-18T01:00:00.000Z';
const BASE = 'a'.repeat(64);

const proposal = (over: Partial<NewPipelineProposal> = {}): NewPipelineProposal => ({
  project: 'alpha',
  lane: 'standard',
  key: 'standard:add:security-reviewer@after:g1',
  base_hash: BASE,
  op: {
    op: 'add',
    stage: {
      id: 'dir-sec',
      kind: 'agent',
      label: 'Security',
      agent: 'security-reviewer',
    },
    after: 'g1',
    reason: 'The change touches authentication code.',
  },
  proposed: BUILTIN_PIPELINES.standard,
  evidence: [
    { ticket_id: makeTicket(1).id, reason: 'The change touches authentication code.' },
  ],
  count: 3,
  created_at: T0,
  ...over,
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describePipelineProposalsContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('pipeline proposals', () => {
    it('stores a proposal pending, reads it back whole and lists it', async () => {
      const id = await tx((t) => t.pipelineProposals.insert(proposal()));

      expect(typeof id).toBe('number');
      expect(await tx((t) => t.pipelineProposals.get(id as number))).toEqual({
        ...proposal(),
        id,
        status: 'pending',
      });

      expect(await tx((t) => t.pipelineProposals.get(999))).toBeNull();
      expect(
        (await tx((t) => t.pipelineProposals.list('alpha'))).map((p) => p.id),
      ).toEqual([id]);
    });

    it('reports exists for the same project, lane, key and base, whatever its status', async () => {
      const id = (await tx((t) => t.pipelineProposals.insert(proposal()))) as number;

      expect(await tx((t) => t.pipelineProposals.insert(proposal()))).toBe('exists');

      await tx((t) =>
        t.pipelineProposals.decide(id, { status: 'rejected', reason: 'not now', at: T1 }),
      );

      expect(await tx((t) => t.pipelineProposals.insert(proposal()))).toBe('exists');
    });

    it('treats another base, lane, key or project as a new proposal', async () => {
      await tx((t) => t.pipelineProposals.insert(proposal()));

      for (const other of [
        proposal({ base_hash: 'b'.repeat(64) }),
        proposal({ lane: 'full' }),
        proposal({ key: 'standard:remove:reviewer' }),
        proposal({ project: 'beta' }),
      ]) {
        expect(typeof (await tx((t) => t.pipelineProposals.insert(other)))).toBe(
          'number',
        );
      }
    });

    it('decides a pending proposal once: the second decision loses', async () => {
      const id = (await tx((t) => t.pipelineProposals.insert(proposal()))) as number;

      const first = await tx((t) =>
        t.pipelineProposals.decide(id, {
          status: 'accepted',
          reason: 'good idea',
          config_version: 'c1:p2',
          at: T1,
        }),
      );

      const second = await tx((t) =>
        t.pipelineProposals.decide(id, { status: 'rejected', reason: 'no', at: T1 }),
      );

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(await tx((t) => t.pipelineProposals.get(id))).toMatchObject({
        status: 'accepted',
        decided_at: T1,
        decided_reason: 'good idea',
        config_version: 'c1:p2',
      });

      expect(
        await tx((t) => t.pipelineProposals.decide(999, { status: 'stale', at: T1 })),
      ).toBe(false);
    });

    it('lists a project newest first and narrows by status', async () => {
      const a = (await tx((t) => t.pipelineProposals.insert(proposal()))) as number;
      const b = (await tx((t) =>
        t.pipelineProposals.insert(proposal({ key: 'standard:remove:reviewer' })),
      )) as number;

      await tx((t) => t.pipelineProposals.insert(proposal({ project: 'beta' })));
      await tx((t) => t.pipelineProposals.decide(a, { status: 'stale', at: T1 }));

      expect(
        (await tx((t) => t.pipelineProposals.list('alpha'))).map((p) => p.id),
      ).toEqual([b, a]);

      expect(
        (await tx((t) => t.pipelineProposals.list('alpha', 'pending'))).map((p) => p.id),
      ).toEqual([b]);

      expect(await tx((t) => t.pipelineProposals.list('ghost'))).toEqual([]);
    });

    it('refuses a malformed proposal and writes nothing', async () => {
      await expect(
        tx((t) => t.pipelineProposals.insert(proposal({ evidence: [] }))),
      ).rejects.toThrow();

      expect(await tx((t) => t.pipelineProposals.list('alpha'))).toEqual([]);
    });
  });

  describe('finding marks', () => {
    const seedRow = async (): Promise<number> => {
      await tx((t) => t.tickets.insert(makeTicket(1)));

      return (await tx((t) =>
        t.stageRuns.start({
          ticket_id: makeTicket(1).id,
          stage_id: 'reviewer',
          member_id: '',
          cycle: 0,
          kind: 'agent',
          status: 'failed',
          started_at: T0,
        }),
      )) as number;
    };

    const mark = (
      stage_run_id: number,
      finding_index: number,
      verdict: 'real' | 'false_alarm',
    ) => ({
      ticket_id: makeTicket(1).id,
      stage_run_id,
      finding_index,
      verdict,
      marked_at: T1,
    });

    it('stores one mark per finding and replaces it on a second mark', async () => {
      const row = await seedRow();

      await tx((t) => t.findingMarks.set(mark(row, 0, 'real')));
      await tx((t) => t.findingMarks.set(mark(row, 1, 'real')));
      await tx((t) => t.findingMarks.set(mark(row, 0, 'false_alarm')));

      expect(await tx((t) => t.findingMarks.listByStageRuns([row]))).toEqual([
        { stage_run_id: row, finding_index: 0, verdict: 'false_alarm', marked_at: T1 },
        { stage_run_id: row, finding_index: 1, verdict: 'real', marked_at: T1 },
      ]);
    });

    it('clears a mark and says whether there was one', async () => {
      const row = await seedRow();
      await tx((t) => t.findingMarks.set(mark(row, 0, 'real')));

      expect(await tx((t) => t.findingMarks.clear(row, 0))).toBe(true);
      expect(await tx((t) => t.findingMarks.clear(row, 0))).toBe(false);
      expect(await tx((t) => t.findingMarks.listByStageRuns([row]))).toEqual([]);
    });

    it('lists marks by ticket and reads none for an empty list', async () => {
      const row = await seedRow();
      await tx((t) => t.findingMarks.set(mark(row, 2, 'real')));

      expect(
        await tx((t) => t.findingMarks.listByTickets([makeTicket(1).id])),
      ).toHaveLength(1);

      expect(await tx((t) => t.findingMarks.listByTickets(['SF-99']))).toEqual([]);
      expect(await tx((t) => t.findingMarks.listByTickets([]))).toEqual([]);
      expect(await tx((t) => t.findingMarks.listByStageRuns([]))).toEqual([]);
    });

    it('refuses a mark with an unknown verdict', async () => {
      const row = await seedRow();

      await expect(
        tx((t) =>
          t.findingMarks.set({ ...mark(row, 0, 'real'), verdict: 'maybe' } as never),
        ),
      ).rejects.toThrow();
    });
  });

  describe('project purge', () => {
    const seedProject = async (slug: string): Promise<void> => {
      const id = makeTicket(slug === 'alpha' ? 1 : 2).id;
      await tx(async (t) => {
        await t.projects.upsert(makeProject(slug, { slug }));
        await t.tickets.insert(makeTicket(slug === 'alpha' ? 1 : 2, { project: slug }));
        const row = (await t.stageRuns.start({
          ticket_id: id,
          stage_id: 'reviewer',
          member_id: '',
          cycle: 0,
          kind: 'agent',
          status: 'failed',
          started_at: T0,
        })) as number;

        await t.findingMarks.set({
          ticket_id: id,
          stage_run_id: row,
          finding_index: 0,
          verdict: 'real',
          marked_at: T1,
        });

        await t.pipelineProposals.insert(proposal({ project: slug }));
      });
    };

    it('removes the proposals and marks of a purged project, and leaves another project alone', async () => {
      await seedProject('alpha');
      await seedProject('beta');

      expect(await tx((t) => t.projects.purge('alpha'))).toBe(true);

      expect(await tx((t) => t.pipelineProposals.list('alpha'))).toEqual([]);
      expect(await tx((t) => t.findingMarks.listByTickets([makeTicket(1).id]))).toEqual(
        [],
      );

      expect(await tx((t) => t.pipelineProposals.list('beta'))).toHaveLength(1);
      expect(
        await tx((t) => t.findingMarks.listByTickets([makeTicket(2).id])),
      ).toHaveLength(1);
    });
  });
}
