/**
 * Contract cases for the artifacts a pipeline stage was shown or left behind.
 *
 * Why: the owner must be able to open a stage on the ticket page and see exactly what a reviewer
 *   read, long after the run, so artifacts are stored whole with their hash. Lists must come back
 *   without their content (a diff can be hundreds of kilobytes and the strip only needs ids and
 *   kinds), one artifact must be read only through its own ticket (so one ticket's id can never read
 *   another's), and a kind outside the closed set, an oversized content or a bad hash must be refused
 *   on both backends.
 *
 * Exports: describeStageArtifactsContract().
 * Depends on: vitest, @forge/core, helpers/fixtures, contract/stage-runner.contract. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@forge/core';
import { T0, makeTicket } from '#tests/helpers/fixtures.js';
import { attempt } from './stage-runner.contract.js';

const HASH = 'b'.repeat(64);

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeStageArtifactsContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);
  const seedTicket = (n = 1) => tx((t) => t.tickets.insert(makeTicket(n)));
  const TID = makeTicket(1).id;

  describe('stage artifacts', () => {
    const artifact = (stageRunId: number, over: Record<string, unknown> = {}) => ({
      ticket_id: TID,
      stage_run_id: stageRunId,
      kind: 'diff' as const,
      content: 'diff --git a b',
      truncated: false,
      sha256: HASH,
      created_at: T0,
      ...over,
    });

    async function withRun(): Promise<number> {
      await seedTicket();

      return (await tx((t) => t.stageRuns.start(attempt(TID, 'implementer')))) as number;
    }

    it('stores an artifact whole, with its flags, and numbers it', async () => {
      const run = await withRun();

      const a = await tx((t) => t.stageArtifacts.add(artifact(run, { truncated: true })));
      const b = await tx((t) =>
        t.stageArtifacts.add(artifact(run, { kind: 'narrative', content: 'my account' })),
      );

      expect(a).toMatchObject({
        id: expect.any(Number),
        kind: 'diff',
        truncated: true,
        sha256: HASH,
      });

      expect(b.id).toBeGreaterThan(a.id);
      expect(await tx((t) => t.stageArtifacts.get(TID, b.id))).toEqual(b);
    });

    it("lists the ticket's artifacts without their content, oldest first", async () => {
      const run = await withRun();
      await tx(async (t) => {
        await t.stageArtifacts.add(artifact(run, { content: 'a'.repeat(1000) }));
        await t.stageArtifacts.add(
          artifact(run, { kind: 'finish_claims', content: '{}' }),
        );
      });

      const list = await tx((t) => t.stageArtifacts.listByTicket(TID));

      expect(list.map((a) => a.kind)).toEqual(['diff', 'finish_claims']);
      expect(list.every((a) => !('content' in a))).toBe(true);
      expect(list[0]).toMatchObject({
        stage_run_id: run,
        truncated: false,
        sha256: HASH,
      });
    });

    it('reads one artifact only through its own ticket', async () => {
      const run = await withRun();
      const a = await tx((t) => t.stageArtifacts.add(artifact(run)));
      await seedTicket(2);

      expect(await tx((t) => t.stageArtifacts.get(makeTicket(2).id, a.id))).toBeNull();
      expect(await tx((t) => t.stageArtifacts.get(TID, 9999))).toBeNull();
    });

    it('refuses a kind outside the closed set, a content over the cap and a bad hash', async () => {
      const run = await withRun();

      await expect(
        tx((t) => t.stageArtifacts.add(artifact(run, { kind: 'secrets' }) as never)),
      ).rejects.toThrow();

      await expect(
        tx((t) => t.stageArtifacts.add(artifact(run, { content: 'x'.repeat(200_001) }))),
      ).rejects.toThrow();

      await expect(
        tx((t) => t.stageArtifacts.add(artifact(run, { sha256: 'nope' }))),
      ).rejects.toThrow();
    });
  });
}
