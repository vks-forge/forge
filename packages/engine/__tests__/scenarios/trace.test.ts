/**
 * Scenario: the engine reports what it does to the debug trace sink.
 *
 * Why: when a Worker goes quiet or a Director step is thrown away, the owner reads the trace
 *   to see which run emitted what, when it ended and which step the Director rejected and why
 *   (d-0163). The engine is where run events enter (the pump), where runs start and settle and
 *   where a step is rejected, so each of those must leave exactly one readable entry, and an
 *   engine given no sink must behave as before.
 *
 * Pins: one `run_event` per event the pump receives (full payload), a `run` entry for the start
 *   request and for the end result, one `engine` entry per dispatch pick, one per rejected
 *   step with the error kind and message, one per step retry; no sink means no failure.
 * Depends on: helpers/rig, helpers/scripted-llm, @forge/core (TraceInput), vitest.
 */

import type { TraceInput, TraceSink } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import { fail } from '#tests/helpers/scripted-llm.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

function recorder(): { sink: TraceSink; entries: TraceInput[] } {
  const entries: TraceInput[] = [];

  return { sink: { emit: (e) => void entries.push(e) }, entries };
}

describe('engine trace', () => {
  it('records the start request, every run event and the end result of a run', async () => {
    const rig = await makeRig();
    const { sink, entries } = recorder();
    const engine = rig.restart('srv-a', { trace: sink });
    await rig.request('Do a thing');

    await rig.tickOn(engine);
    rig.driver.emit('run-1', {
      type: 'tool_call',
      tool: 'Read',
      input: { path: 'a.ts' },
    } as never);

    await rig.flush();
    rig.driver.finish('run-1', makeResult());
    await rig.flush();
    await rig.tickOn(engine);

    const start = entries.find((e) => e.kind === 'run' && e.message.startsWith('run start'));
    expect(start).toMatchObject({ run_id: 'run-1', actor: 'engine' });

    const events = entries.filter((e) => e.kind === 'run_event');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ run_id: 'run-1', actor: 'worker' });
    expect(JSON.stringify(events.map((e) => e.data))).toContain('a.ts');

    const ended = entries.find((e) => e.kind === 'run' && e.message.startsWith('run result'));
    expect(ended).toMatchObject({ run_id: 'run-1' });
    expect(ended?.data).toMatchObject({ status: 'success' });
    expect(entries.some((e) => e.kind === 'engine' && e.message.includes('dispatch'))).toBe(
      true,
    );
  });

  it('records a rejected step with its error and a retry after invalid output', async () => {
    const rig = await makeRig();
    const { sink, entries } = recorder();
    const engine = rig.restart('srv-a', { trace: sink });
    await rig.request('Do a thing');
    rig.llm.script(
      'dispatch_prompt',
      fail({ kind: 'invalid_output', message: 'bad shape' }),
    );

    await rig.tickOn(engine);

    const retry = entries.find((e) => e.kind === 'engine' && e.message.includes('retry'));
    expect(retry).toMatchObject({ step: 'dispatch_prompt' });

    const rejected = entries.find(
      (e) => e.kind === 'engine' && e.message.includes('rejected'),
    );
    expect(rejected).toMatchObject({ step: 'dispatch_prompt', level: 'warn' });
    expect(JSON.stringify(rejected?.data)).toContain('bad shape');
  });

  it('works with no sink', async () => {
    const rig = await makeRig();
    await rig.request('Do a thing');

    const report = await rig.tick();

    expect(report.dispatched).toHaveLength(1);
  });
});
