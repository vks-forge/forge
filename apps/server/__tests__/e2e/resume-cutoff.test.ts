/**
 * End to end: a write cut off by a restart fails G1 instead of merging on a gap.
 *
 * Why: when `forge stop` lands inside a Worker's `Write`, the file may be on disk but the
 *   call's effect receipt (PostToolUse) never reached the server. The resumed Worker then
 *   claims it edited that file, and nothing signed says the edit happened. The restart excuse
 *   only covers read-only calls (storage-tool-calls.ts), so the claim is unsupported and G1
 *   must fail closed: merging code whose authorship cannot be shown is the failure G1 exists to
 *   stop. A graceful stop first drains (waits for the call to record its effect), but this
 *   Write never completes, so the drain times out and the run is interrupted anyway: this is the
 *   case the drain cannot save and it must stay closed. The scripted run parks inside its
 *   first `Write` (edit written, no effect receipt) and the test pins that G1 fails with
 *   exactly that finding, quickly, rather than the ticket hanging in rework.
 *
 * Pins: the chain still verifies and every tool call has its decision receipt; the only
 *   failed check is `claims`, with the unsupported `edited src/math.js` finding; the ticket
 *   is not merged.
 * Depends on: helpers/restart-scenario, helpers/gate-diagnostics, helpers/wait-for.
 *   IO: git, SQLite, npm, loopback sockets.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import { failedGateReport } from '#tests/helpers/gate-diagnostics.js';
import { git } from '#tests/helpers/fixture-repo.js';
import { interruptAndRestart } from '#tests/helpers/restart-scenario.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: { status: string };
  gate_results: { gate: string; status: string; report_ref?: string }[];
}

describe('a write cut off by a restart', { timeout: 200_000 }, () => {
  let first: E2eRig;
  let second: E2eRig;
  let gate: { gate: string; report: string };

  beforeAll(async () => {
    // Stop on the Write's `tool_call`: the script is inside the Write at that moment.
    // The scripted Write never completes, so the drain (shortened here) times out and the stop
    // goes on to interrupt the run: the case the drain cannot save.
    ({ first, second } = await interruptAndRestart(
      ['resumable_cut_write'],
      { type: 'tool_call', count: 2 },
      { drainMs: 300 },
    ));

    gate = await waitFor(
      'G1 to fail',
      async () => {
        const res = await second.call('GET', '/tickets/FX-1');

        return failedGateReport(second, (res.body as TicketView).gate_results) ?? false;
      },
      120_000,
    );
  }, 180_000);

  afterAll(async () => {
    await second?.dispose();
    await first?.dispose();
  });

  it('fails G1 on the unsupported claim and nothing else', () => {
    expect(gate.gate).toBe('G1');
    expect(gate.report).toContain('## chain: passed');
    expect(gate.report).toContain('## claims: failed');
    expect(gate.report).toContain(
      'Unsupported claim {"kind":"edited","path":"src/math.js"}: no allowed edit or write receipt with a committed effect for that path',
    );

    expect(gate.report).not.toContain('has no decision receipt');
    expect(gate.report).toContain('### test: passed');
  });

  it('waited out the drain, then interrupted the run anyway', () => {
    expect(first.logs.join(' ')).toContain('still had a tool call in flight');
  });

  it('did not merge the change', async () => {
    const res = await second.call('GET', '/tickets/FX-1');

    expect((res.body as TicketView).ticket.status).not.toBe('done');
    expect(git(second.fixture.remote, 'show', 'main:src/math.js')).not.toContain(
      'export function add(a, b)',
    );
  });

  it('ended the unscripted rework run at once instead of leaving it parked', async () => {
    const failure = await waitFor(
      'the rework run to be refused',
      () => second.worker.failures[0],
      30_000,
    );

    expect(failure).toContain('no script for run');
  });
});
