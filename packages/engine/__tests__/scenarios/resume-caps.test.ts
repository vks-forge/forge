/**
 * Scenario: resuming an interrupted run waits for the scheduler's limits.
 *
 * Why: a resume starts a Worker again, which spends the same slot a new run would. After a
 *   restart the first tick must not start more runs than the global, per-project and
 *   per-harness caps allow just because those runs were interrupted rather than new (d-0097).
 *   A run that does not fit stays `interrupted`, keeps its ticket assigned and is tried again
 *   on the next tick; the invariant sweep must not call that a lost ticket.
 *
 * Pins: with the only global slot taken the interrupted run is not resumed and nothing is
 *   reported as a violation; once the slot frees the next tick resumes it.
 * Depends on: helpers/rig, helpers/resume, vitest.
 */

import { describe, expect, it } from 'vitest';
import { getRun, liveRun } from '#tests/helpers/resume.js';
import { makeRig } from '#tests/helpers/rig.js';

describe('resume under the scheduler caps', () => {
  it('leaves the run interrupted while the only slot is busy, then resumes it', async () => {
    const rig = await makeRig({ engine: { max_concurrent_global: 1 } });
    await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    // Another run of the new server holds the only slot.
    await rig.storage.transaction((tx) =>
      tx.runs.insert({
        id: 'run-busy',
        ticket_id: 'FG-77',
        project: 'forge',
        harness: 'claude-code',
        driver_version: '1',
        cwd: '/w',
        lane: 'express',
        started_at: new Date(rig.clock.now()).toISOString(),
        status: 'running',
        owner: 'srv-b',
      }),
    );

    const b = rig.restart('srv-b');
    const first = await b.tick();

    expect(first.resumed).toEqual([]);
    expect(first.violations).toEqual([]);
    expect(rig.driver.starts).toHaveLength(1);
    expect((await getRun(rig, 'run-1'))?.status).toBe('interrupted');

    await rig.storage.transaction((tx) =>
      tx.runs.update('run-busy', {
        status: 'success',
        ended_at: new Date(rig.clock.now()).toISOString(),
      }),
    );

    const second = await b.tick();

    expect(second.resumed).toEqual(['run-1']);
    expect(rig.driver.starts.at(-1)).toMatchObject({ runId: 'run-1', generation: 2 });
  });
});
