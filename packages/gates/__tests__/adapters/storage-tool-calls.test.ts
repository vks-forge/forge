/**
 * Pins which tool calls G1 requires a receipt for.
 *
 * Why: G1 treats a tool call the harness reported but the hook never receipted as a bypass.
 *   When a restart interrupts a run, the harness has already announced the calls it was about
 *   to make, and the process dies before their PreToolUse hook is answered: those calls never
 *   ran, so no receipt exists and none is owed. The live restart probe (probe 10) failed G1 on
 *   exactly such a `Glob` until this was handled. The cut-off is visible in the event stream:
 *   a resumed process registers hook liveness again, so a call still without a result when a
 *   later liveness event arrives was abandoned by the restart. Everything else must still be
 *   required, above all a call that has a result (it ran) or one still open at the end of the
 *   run, or a hook bypass could hide behind a restart.
 *
 * Pins: abandoned in-flight calls before a later liveness event are not listed; calls with a
 *   result and calls open at the end are; the first liveness event excuses nothing.
 * Depends on: adapters/storage-tool-calls, vitest. No IO.
 */

import type { RunEvent, StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createStorageToolCallLister } from '#/adapters/storage-tool-calls.js';

const TS = '2026-10-15T00:00:00.000Z';
let seq = 0;

const live = (): RunEvent => ({
  type: 'hook_liveness',
  seq: seq++,
  ts: TS,
  fingerprint: 'f',
});

const call = (id: string, name = 'Read'): RunEvent => ({
  type: 'tool_call',
  seq: seq++,
  ts: TS,
  call_id: id,
  name,
  input: {},
});

const result = (id: string): RunEvent => ({
  type: 'tool_result',
  seq: seq++,
  ts: TS,
  call_id: id,
  output: 'ok',
  is_error: false,
});

function listed(events: RunEvent[]): Promise<{ callId: string; name: string }[]> {
  const storage = {
    transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({ runEvents: { listByRun: () => Promise.resolve(events) } })),
  } as unknown as StorageAdapter;

  return createStorageToolCallLister(storage)('run-1').then((c) => [...c]);
}

describe('createStorageToolCallLister', () => {
  it('lists every tool call of a run that was never interrupted, finished or not', async () => {
    const events = [live(), call('a'), result('a'), call('b', 'Bash')];

    expect(await listed(events)).toEqual([
      { callId: 'a', name: 'Read' },
      { callId: 'b', name: 'Bash' },
    ]);
  });

  it('drops a call that was in flight when the run was interrupted and resumed', async () => {
    const events = [
      live(),
      call('done'),
      call('cut-off', 'Glob'),
      result('done'),
      live(),
      call('after'),
      result('after'),
    ];

    expect(await listed(events)).toEqual([
      { callId: 'done', name: 'Read' },
      { callId: 'after', name: 'Read' },
    ]);
  });

  it('still requires a call that has a result, even before a later liveness event', async () => {
    const events = [live(), call('ran'), result('ran'), live()];

    expect(await listed(events)).toEqual([{ callId: 'ran', name: 'Read' }]);
  });

  it('still requires a call left open after the last resume', async () => {
    const events = [live(), call('old'), live(), call('open', 'Edit')];

    expect(await listed(events)).toEqual([{ callId: 'open', name: 'Edit' }]);
  });

  it('requires a call whose result arrives at any point, even after a later liveness event', async () => {
    const events = [live(), call('late'), live(), result('late')];

    expect(await listed(events)).toEqual([{ callId: 'late', name: 'Read' }]);
  });

  it('drops one call per interruption, over several resumes', async () => {
    const events = [
      live(),
      call('x1'),
      live(),
      call('x2'),
      live(),
      call('keep'),
      result('keep'),
    ];

    expect(await listed(events)).toEqual([{ callId: 'keep', name: 'Read' }]);
  });
});
