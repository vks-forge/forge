/**
 * End to end: G1 catches a planted false claim, the ticket is reworked, then parked.
 *
 * Why: the whole point of independent verification is that a Worker's word is not enough.
 *   Here the Worker does all the real work and then also claims it edited `src/ghost.js`,
 *   a file it never touched. The gate must fail on exactly that claim, the Director must
 *   send the Worker back with the finding (a rework run, not a merge), and after the
 *   automatic rework cap the ticket must stop in front of a human with the gate named,
 *   with nothing merged into the remote's main.
 *
 * Pins: no script error and every run `success`; G1 `failed` on every run; the finding quotes the false claim; two reworks then a
 *   park in `waiting_human`; the rework prompt carries the finding; main is untouched.
 * Depends on: helpers/e2e-rig. IO: git, SQLite, npm, a loopback socket.
 */

import { MAX_AUTO_REWORKS } from '@forge/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { git } from '#tests/helpers/fixture-repo.js';
import { intakeBody, startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: { status: string; rework_count: number; blocked_reason?: string };
  runs: { id: string; status: string; retry_of?: string }[];
  gate_results: { gate: string; status: string }[];
}

// Three Worker runs, each followed by a real `npm test` and lint in G1: about twenty seconds
// in all unloaded; the limits allow for the full suite running in parallel on one machine.
describe('a planted false claim', { timeout: 420_000 }, () => {
  let rig: E2eRig;
  let view: TicketView;

  beforeAll(async () => {
    rig = await startE2eRig(['false_claim']);
    await rig.call('POST', '/intake', intakeBody('claim-1'));
    view = await waitFor(
      'the ticket to park after the rework cap',
      async () => {
        const found = (await rig.call('GET', '/tickets/FX-1')).body as TicketView;

        return found.ticket.status === 'waiting_human' && found.gate_results.length >= 3
          ? found
          : false;
      },
      400_000,
    );
  }, 420_000);

  afterAll(async () => {
    await rig.dispose();
  });

  it('ran every scripted Worker step without a script error', () => {
    // A hook post that the rig dropped (a reset on a pooled socket, say) would make a run
    // fail for the wrong reason while G1 still reported the false claim.
    expect(rig.worker.failures).toEqual([]);
    expect(view.runs.map((r) => r.status)).toEqual(view.runs.map(() => 'success'));
  });

  it('fails G1 on every run and quotes the false claim', () => {
    expect(view.gate_results.map((g) => [g.gate, g.status])).toEqual([
      ['G1', 'failed'],
      ['G1', 'failed'],
      ['G1', 'failed'],
    ]);

    expect(view.ticket.blocked_reason).toContain('src/ghost.js');
  });

  it('reworks up to the cap and then parks the ticket for a human', () => {
    expect(view.ticket.rework_count).toBe(MAX_AUTO_REWORKS);
    const table = view.runs.map((r) => JSON.stringify(r)).join(String.fromCharCode(10));

    expect(view.runs, table + rig.logs.join(String.fromCharCode(10))).toHaveLength(
      MAX_AUTO_REWORKS + 1,
    );

    expect(view.runs[1]?.retry_of).toBe(view.runs[0]?.id);
    expect(view.ticket.blocked_reason).toContain('gate G1 failed');
  });

  it('sends the gate finding back in the rework prompt', () => {
    const prompts = rig.director.calls.filter((c) => c.name === 'dispatch_prompt');
    const second = prompts[1]?.input as { wake: { kind: string; gate_findings: string } };

    expect(prompts).toHaveLength(MAX_AUTO_REWORKS + 1);
    expect(second.wake.kind).toBe('rework');
    expect(second.wake.gate_findings).toContain('src/ghost.js');
  });

  it('never merges anything into the remote main', () => {
    const math = git(rig.fixture.remote, 'show', 'main:src/math.js');

    expect(math).not.toContain('add');
  });
});
