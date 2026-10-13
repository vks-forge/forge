/**
 * Scenario: the gates run beside the tick, not inside it.
 *
 * Why: the gates run the project's lint, typecheck and tests, which can take half an hour.
 *   If the tick waited for them, no other ticket would be settled, steered or dispatched in
 *   that time, and a stalled Worker would go unnoticed. The gate run is therefore a
 *   background job: the tick that publishes starts it and returns, the job stores its rows
 *   and asks for a tick, and the next tick applies the verdicts. A job must never be started
 *   twice for one ticket, and a restart (which loses the job) must simply run the gates again.
 *
 * Pins: a slow gate does not block dispatch of another ticket in the same tick; completion
 *   calls `requestTick`; no second start while one is in flight; the verdict is applied by
 *   the following tick (merge); a restart re-runs the gates; a job that threw becomes a
 *   verify retry, not a lost ticket.
 * Depends on: helpers/verify-rig, helpers/fake-git-host, vitest.
 */

import { CrashError } from '@forge/core';
import type { Gate, GateContext, GateVerdict } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { verdict } from '#tests/helpers/fake-git-host.js';
import { makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

/** A gate that answers only when the test says so. */
function createDeferredGate(): Gate & {
  readonly contexts: GateContext[];
  release(v?: GateVerdict): void;
  fail(e: Error): void;
} {
  const contexts: GateContext[] = [];
  const waiting: {
    resolve: (v: GateVerdict) => void;
    reject: (e: Error) => void;
  }[] = [];

  return {
    name: 'G1',
    contexts,
    run(ctx) {
      contexts.push(ctx);

      return new Promise<GateVerdict>((resolve, reject) => {
        waiting.push({ resolve, reject });
      });
    },
    release(v = verdict('passed')) {
      for (const w of waiting.splice(0)) {
        w.resolve(v);
      }
    },
    fail(e) {
      for (const w of waiting.splice(0)) {
        w.reject(e);
      }
    },
  };
}

async function slowRig() {
  const v = await makeVerifyRig();
  const gate = createDeferredGate();
  v.rig.runtime.current = { ...v.rig.runtime.current!, gates: [gate] };

  return { ...v, gate };
}

describe('verify: gate jobs', () => {
  it('does not block dispatch of another ticket while a gate is running', async () => {
    const { rig, gate } = await slowRig();
    const a = await startAndFinish(rig);
    const b = await rig.request('Another request');

    const report = await rig.engine.tick();

    expect(rig.engine.gateJobsInFlight()).toBe(1);
    expect(gate.contexts).toHaveLength(1);
    expect((await rig.ticket(a)).status).toBe('verifying');
    expect(report.dispatched.map((d) => d.ticketId)).toEqual([b]);
    expect(report.verified).toEqual([]);

    gate.release();
    await rig.flush();
  });

  it('asks for a tick when the gates finish, and that tick merges', async () => {
    const { rig, gate, host } = await slowRig();
    const id = await startAndFinish(rig);
    await rig.engine.tick();
    await rig.flush();
    const before = rig.tickRequests.count;

    gate.release();
    await rig.flush();

    expect(rig.tickRequests.count).toBeGreaterThan(before);
    expect(rig.engine.gateJobsInFlight()).toBe(0);
    expect(host.count('merge')).toBe(0);

    const report = await rig.engine.tick();

    expect(report.verified[0]).toMatchObject({ ticketId: id, outcome: 'merged' });
    expect((await rig.ticket(id)).status).toBe('done');
  });

  it('writes the gate rows from the job, with the commit the gates judged', async () => {
    const { rig, gate } = await slowRig();
    rig.worktrees.headSha = 'sha-judged';
    const id = await startAndFinish(rig);
    await rig.engine.tick();

    gate.release();
    await rig.flush();

    const rows = await rig.storage.transaction((tx) => tx.gateResults.listByTicket(id));
    expect(rows).toEqual([
      expect.objectContaining({ gate: 'G1', status: 'passed', head_sha: 'sha-judged' }),
    ]);

    expect((await rig.ticket(id)).status).toBe('verifying');
  });

  it('does not start a second job for the same ticket while one is running or unapplied', async () => {
    const { rig, gate } = await slowRig();
    await startAndFinish(rig);

    await rig.engine.tick();
    await rig.engine.tick();
    await rig.engine.tick();

    expect(gate.contexts).toHaveLength(1);
    expect(rig.engine.gateJobsInFlight()).toBe(1);

    gate.release();
    await rig.flush();
    expect(gate.contexts).toHaveLength(1);
  });

  it('loses an in-flight job on restart and runs the gates again', async () => {
    const { rig, gate, host } = await slowRig();
    const id = await startAndFinish(rig);
    await rig.engine.tick();
    expect(gate.contexts).toHaveLength(1);

    const restarted = rig.restart('srv-a');
    await restarted.tick();

    expect(gate.contexts).toHaveLength(2);
    expect(host.count('openPr')).toBe(1);

    gate.release();
    await rig.flush();
    await restarted.tick();
    expect((await rig.ticket(id)).status).toBe('done');
    expect(host.count('merge')).toBe(1);
  });

  it('turns a job that threw into a verify retry instead of losing the ticket', async () => {
    const { rig, gate } = await slowRig();
    const id = await startAndFinish(rig);
    await rig.engine.tick();

    gate.fail(new CrashError('gate process died'));
    await rig.flush();
    const report = await rig.engine.tick();

    expect(report.verified[0]).toMatchObject({
      ticketId: id,
      outcome: 'retry_scheduled',
    });

    expect((await rig.ticket(id)).status).toBe('verifying');
  });
});
