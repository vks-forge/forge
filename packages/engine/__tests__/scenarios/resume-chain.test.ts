/**
 * Scenario: resuming keeps the receipt chain gap-free and takes its turn like any other start.
 *
 * Why: gate G1 verifies a resumed run segment by segment, and each `resumed` link must be
 *   exactly one generation above the last. A resume whose harness failed to start before the
 *   app wrote the link must not leave the run row one generation ahead of the chain, or the
 *   next resume links N+2 and the whole run fails verification. A resume also spends a
 *   Worker slot, so it must queue by its ticket's priority and share the rotation cursor with
 *   the dispatch phase; its own read of the schedule consumes nothing.
 *
 * Pins: a failed start before the link gives the generation back; a failed start after the
 *   link keeps it; with one free slot the interrupted run of the higher-priority ticket is
 *   resumed first.
 * Depends on: helpers/rig, helpers/resume, @forge/db, vitest.
 */

import { describe, expect, it } from 'vitest';
import { getRun, liveRun } from '#tests/helpers/resume.js';
import { makeRig } from '#tests/helpers/rig.js';

describe('a resume whose harness does not start', () => {
  it('gives the generation back when the chain never got the resumed link', async () => {
    const rig = await makeRig();
    await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();
    rig.driver.failNextStart(new Error('spawn failed'));

    await rig.restart('srv-b').tick();

    expect((await getRun(rig, 'run-1'))?.generation ?? 1).toBe(1);
  });

  it('keeps the generation when the link was already written', async () => {
    const rig = await makeRig();
    await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();
    rig.receipts.setReceipts('run-1', [{ kind: 'resumed', generation: 2 }]);
    rig.driver.failNextStart(new Error('spawn failed after the link'));

    await rig.restart('srv-b').tick();

    expect((await getRun(rig, 'run-1'))?.generation).toBe(2);
  });
});

describe('resume scheduling', () => {
  it('resumes the run of the higher-priority ticket when one slot is free', async () => {
    const rig = await makeRig({
      engine: { max_concurrent_per_project: 2, max_concurrent_global: 2 },
    });

    await rig.request('routine');
    await rig.request('urgent');
    await rig.tick();
    for (const id of ['run-1', 'run-2']) {
      rig.driver.emit(id, { type: 'session', session_ref: `sess-${id}` });
    }

    await rig.flush();
    await rig.engine.interruptRun('run-1');
    await rig.engine.interruptRun('run-2');
    await rig.flush();
    await rig.storage.transaction(async (tx) => {
      const t = await tx.tickets.get('FG-2' as never);
      await tx.tickets.updateTicketCas('FG-2' as never, t!.status_version, {
        priority: 5,
      });
    });

    await rig.config.append({
      scope: 'company',
      doc: { engine: { max_concurrent_per_project: 2, max_concurrent_global: 1 } },
      author: 'test',
      reason: 'one slot',
      expectedVersion: 1,
    });

    const report = await rig.restart('srv-b').tick();

    expect(report.resumed).toEqual(['run-2']);
    expect((await getRun(rig, 'run-1'))?.status).toBe('interrupted');
  });
});
