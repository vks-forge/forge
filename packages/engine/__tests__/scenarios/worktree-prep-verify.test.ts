/**
 * Scenario: the Worker changes what the packages come from, and the gates must still judge the code.
 *
 * Why: a tree is prepared before its Worker starts, but the Worker may edit the lockfile. If
 *   that edit breaks the install, the Worker's change is the cause and the work goes back to it as
 *   a failed `setup` gate with the output (a rework, bounded like any other); the owner is not
 *   asked to debug a Worker's lockfile. If the install fails for a reason the Worker did not cause
 *   (the tool vanished, the network is down) that is a fault retried or parked by family, never a
 *   verdict on the Worker's work. An unchanged tree costs nothing: the gates run as before.
 *
 * Pins: a Worker-caused setup failure is a failed `setup` row, G1 does not run, the Worker is
 *   restarted even though setup still fails, and its prompt carries the output; a failure the
 *   Worker did not cause parks without a rework; a prepared tree lets the gates pass and merge.
 * Depends on: helpers/verify-rig, helpers/fake-preparer, vitest.
 */

import { describe, expect, it } from 'vitest';
import { createFakePreparer, failure } from '#tests/helpers/fake-preparer.js';
import type { Rig } from '#tests/helpers/rig.js';
import { finishRun, makeVerifyRig } from '#tests/helpers/verify-rig.js';
import type { ProjectRuntime } from '#/types/verify.types.js';

const gateRows = (rig: Rig, id: string) =>
  rig.storage.transaction((tx) => tx.gateResults.listByTicket(id));

async function preparedAndFinished() {
  const v = await makeVerifyRig();
  const prep = createFakePreparer();
  v.rig.runtime.current = {
    ...(v.rig.runtime.current as ProjectRuntime),
    prepare: prep,
  };

  const id = await v.rig.request('Fix the doctor check');
  await v.rig.tick();
  await finishRun(v.rig, 'run-1');

  return { ...v, prep, id };
}

describe('setup before the gates', () => {
  it('a lockfile the Worker broke is a failed setup gate: G1 does not run and the Worker starts again', async () => {
    const { rig, gate, prep, id } = await preparedAndFinished();
    prep.invalidate();
    prep.result = failure({
      inputs_changed_by_worker: true,
      tail: 'lockfile is out of date',
    });

    const report = await rig.tick();

    expect(report.verified[0]).toMatchObject({
      outcome: 'rework',
      gates: [{ gate: 'setup', status: 'failed' }],
    });

    expect(await gateRows(rig, id)).toEqual([
      expect.objectContaining({ run_id: 'run-1', gate: 'setup', status: 'failed' }),
    ]);

    expect(gate.contexts).toEqual([]);
    expect(report.dispatched).toEqual([{ ticketId: id, runId: 'run-2', kind: 'retry' }]);
    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 1,
    });

    const prompt = JSON.stringify(rig.llm.callsTo('dispatch_prompt').at(-1)?.input);
    expect(prompt).toContain('Setup step');
    expect(prompt).toContain('lockfile is out of date');
  });

  it('a failure the Worker did not cause parks the ticket without a rework or a gate row', async () => {
    const { rig, gate, prep, id } = await preparedAndFinished();
    prep.invalidate();
    prep.result = failure({ exit_code: null, tail: 'pnpm: command not found' });

    const report = await rig.tick();

    expect(report.verified[0]).toMatchObject({ outcome: 'parked' });
    expect(await gateRows(rig, id)).toEqual([]);
    expect(gate.contexts).toEqual([]);
    expect(await rig.ticket(id)).toMatchObject({
      status: 'waiting_human',
      rework_count: 0,
    });
  });

  it('a tree that is still prepared costs nothing: the gates run and the ticket merges', async () => {
    const { rig, gate, id } = await preparedAndFinished();

    const report = await rig.tick();

    expect(report.verified[0]).toMatchObject({ outcome: 'merged' });
    expect(gate.contexts).toHaveLength(1);
    expect((await rig.ticket(id)).status).toBe('done');
  });
});
