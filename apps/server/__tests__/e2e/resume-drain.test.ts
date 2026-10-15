/**
 * End to end: a graceful stop waits for a Write in flight, and the resumed run passes G1.
 *
 * Why: `forge stop` used to land wherever the Worker happened to be. Inside a Write (edit on
 *   disk, PostToolUse not yet posted) it left an edit with no effect receipt, so the resumed
 *   run failed G1 on its own claim and cost a rework run (resume-cutoff.test.ts pins that
 *   case). Now the server drains first: it refuses new tool calls with `server_draining`, waits
 *   until the Write has its effect receipt, and only then interrupts the run. The scripted Write
 *   takes a second between the edit and its PostToolUse, and a parallel Read is attempted
 *   while it runs, so the stop deterministically arrives with a call in flight.
 *
 * Pins: the stop took long enough to include the Write's remaining time; the parallel Read was
 *   refused with `server_draining`; the run is `interrupted` with its session; the second
 *   server resumes the same run, which finishes in one run row; G1 passes (no rework) and the
 *   change is merged.
 * Depends on: helpers/restart-scenario, helpers/wait-for, helpers/e2e-rig. IO: git, SQLite, npm, loopback sockets.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import { assertNoFailedGate } from '#tests/helpers/gate-diagnostics.js';
import { git } from '#tests/helpers/fixture-repo.js';
import { interruptAndRestart } from '#tests/helpers/restart-scenario.js';
import type { Stopped } from '#tests/helpers/restart-scenario.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: { status: string };
  runs: { id: string; status: string; generation?: number }[];
  gate_results: { gate: string; status: string; report_ref?: string }[];
}

describe('a graceful stop inside a slow Write', { timeout: 300_000 }, () => {
  let first: E2eRig;
  let second: E2eRig;
  let runId = '';
  let stopped: Stopped;
  let stopMs = 0;
  let view: TicketView;

  beforeAll(async () => {
    // Stop on the Write's `tool_call`: the script is inside the Write at that moment.
    ({ first, second, runId, stopped, stopMs } = await interruptAndRestart(
      ['resumable_slow_write'],
      { type: 'tool_call', count: 2 },
    ));

    try {
      view = await waitFor(
        'ticket FX-1 to be done',
        async () => {
          const res = await second.call('GET', '/tickets/FX-1');
          const found = res.body as TicketView;
          assertNoFailedGate(second, found.gate_results);

          return found.ticket.status === 'done' ? found : false;
        },
        90_000,
      );
    } catch (error) {
      const now = await second.call('GET', '/tickets/FX-1');

      throw new Error(
        [
          String(error),
          JSON.stringify(now.body),
          ...first.logs,
          ...second.logs,
          ...second.worker.failures,
        ].join(String.fromCharCode(10)),
      );
    }
  }, 280_000);

  afterAll(async () => {
    await second?.dispose();
    await first?.dispose();
  });

  it('waited for the Write to record its effect before interrupting', () => {
    expect(stopMs).toBeGreaterThanOrEqual(600);
    expect(first.logs.join('\n')).toContain('waiting up to');
    expect(first.logs.join('\n')).not.toContain('still had a tool call in flight');
    expect(stopped.run).toMatchObject({ status: 'interrupted', generation: 1 });
  });

  it('refused the parallel call that tried to start during the drain', async () => {
    const events = await second.server.storage.transaction((tx) =>
      tx.runEvents.listByRun(runId),
    );

    const refusals = events.filter(
      (e) => e.type === 'tool_result' && JSON.stringify(e).includes('server_draining'),
    );

    expect(refusals).toHaveLength(1);
  });

  it('resumed the same run and merged it after a passed G1, with no rework run', () => {
    expect(second.worker.started).toEqual([runId]);
    expect(view.runs).toHaveLength(1);
    expect(view.runs[0]).toMatchObject({ id: runId, status: 'success', generation: 2 });
    expect(view.gate_results.filter((g) => g.gate === 'G1')).toEqual([
      expect.objectContaining({ status: 'passed' }),
    ]);

    expect(second.worker.failures).toEqual([]);
    expect(git(second.fixture.remote, 'show', 'main:src/math.js')).toContain(
      'export function add(a, b)',
    );
  });
});
