/**
 * Scenario: a clash with main that the writer cannot finish still has a way forward, and Retry really retries.
 *
 * Why: the eval's FR-8 vs FR-6 bug. A conflicting ticket parked as "not retried", and the owner's
 *   Retry put it back to Verifying "with no new Worker run": the same unmergeable PR re-parked it
 *   in one tick, 15 seconds, nothing changed. A clash now goes to the ticket's writer twice (its own
 *   cap, no gate rework), then waits for the owner with a `merge_conflict` failure; Retry must
 *   start a Worker run that is told about the clash again, with the owner's note, and gives exactly
 *   one more attempt (the count stays at the cap).
 *
 * Pins: two resolver runs, then one failure escalation with the clash attached and the ticket
 *   waiting with no `parked_from`; Retry starts a new Worker run in the same tick it is given, whose
 *   wake delta is `merge_conflict` with the files and the owner's note; the retried ticket that clashes
 *   again parks again with a fresh escalation instead of looping.
 * Depends on: helpers/escalation-rig, helpers/verify-rig, @forge/core, vitest.
 */

import { MAX_CONFLICT_RESOLVES } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { pendingOf } from '#tests/helpers/escalation-rig.js';
import { drive, makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

const waiting = (id: string, v: Awaited<ReturnType<typeof makeVerifyRig>>) => async () =>
  (await v.rig.ticket(id)).status === 'waiting_human';

describe('a clash the writer cannot finish', () => {
  it('parks after the cap, and Retry starts a Worker run told about the clash with the owner note', async () => {
    const v = await makeVerifyRig();
    v.rig.worktrees.mergeResult = {
      kind: 'conflict',
      head: 'checkpoint-sha',
      files: [{ path: 'src/cli.ts', binary: false }],
      upstream: [
        { sha: 'abcdef0123456789', subject: 'feat(FG-7): Add the export flag (#3)' },
      ],
    };

    const id = await startAndFinish(v.rig);
    await drive(v.rig, 12, waiting(id, v));

    // The writer was woken for each allowed resolve, then the owner was asked.
    const parked = await v.rig.ticket(id);
    expect(parked).toMatchObject({
      status: 'waiting_human',
      conflict_count: MAX_CONFLICT_RESOLVES,
      rework_count: 0,
    });

    expect(parked.parked_from).toBeUndefined();
    expect(v.rig.driver.starts).toHaveLength(1 + MAX_CONFLICT_RESOLVES);
    const [row] = await pendingOf(v.rig, id, 'failure');
    expect(row!.payload).toMatchObject({
      cause: 'merge_conflict',
      conflict: { files: ['src/cli.ts'] },
    });

    // Retry: the eval bug re-parked in one tick with no run. Now a Worker really starts.
    const startsBefore = v.rig.driver.starts.length;
    const done = await v.rig.engine.actOnEscalation(
      row!.id,
      { action: 'retry', note: 'Keep the export flag and the new alias.' },
      'owner',
    );

    expect(done.status).toBe('done');
    await v.rig.tick();
    expect(v.rig.driver.starts).toHaveLength(startsBefore + 1);
    const delta = v.rig.llm.callsTo('dispatch_prompt').at(-1)!.input as {
      wake: Record<string, unknown>;
    };

    expect(delta.wake).toMatchObject({
      kind: 'merge_conflict',
      files: [{ path: 'src/cli.ts' }],
      note: 'Keep the export flag and the new alias.',
    });

    // It clashes again: exactly one more attempt, then parked again with a new escalation.
    await drive(v.rig, 12, waiting(id, v));
    expect(v.rig.driver.starts).toHaveLength(startsBefore + 1);
    expect((await v.rig.ticket(id)).conflict_count).toBe(MAX_CONFLICT_RESOLVES);
    const again = await pendingOf(v.rig, id, 'failure');
    expect(again).toHaveLength(1);
    expect(again[0]!.id).not.toBe(row!.id);
  });
});
