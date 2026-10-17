/**
 * The trace DirectorLLM decorator: one entry per Director step with everything needed to debug it.
 *
 * Why: when a plan looks wrong or a step fails, the owner needs the step's input, the prompt the
 *   model actually saw, what it printed, what was parsed from it, what it cost, how long it took
 *   and on which model and harness (d-0163). The decorator wraps the model port, collects the
 *   prompt and raw text the driver reports through `onTrace` for exactly this call (even with
 *   several steps in flight), and logs the result or the typed failure. It must return exactly
 *   what the wrapped port returned and never let tracing change a result.
 *
 * Pins: success entry fields, failure entry keeps raw output and error kind, cost summed over
 *   `onCost` and still forwarded, concurrent steps do not mix prompts, card and ticket taken from
 *   the input, results passed through, a throwing sink does not break the step.
 * Depends on: src/services/trace/trace-llm, @forge/core, zod, vitest.
 */

import { err, ok } from '@forge/core';
import type { DirectorLLM, StepOptions, TraceInput } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { traceDirectorLLM } from '#/services/trace/trace-llm.js';

const Out = z.object({ a: z.number() });
const OPTS: StepOptions = { model: 'haiku', budgetUsd: 0.1 };

type Fake = (
  onTrace: (t: { prompt: string; raw: string; exit: string; tail: string }) => void,
  name: string,
  input: unknown,
  opts: StepOptions,
) => Promise<unknown>;

function rig(fake: Fake, over: { emit?: (e: TraceInput) => void } = {}) {
  const entries: TraceInput[] = [];
  let clock = 1_000;
  const holder: { onTrace: (t: never) => void } = { onTrace: () => undefined };
  const inner: DirectorLLM = {
    capabilities: () => ({ structuredOutput: true, reportsCost: true }),
    step: (async (name: string, input: unknown, _schema: unknown, opts: StepOptions) =>
      fake((t) => holder.onTrace(t as never), name, input, opts)) as DirectorLLM['step'],
  };

  const traced = traceDirectorLLM(inner, {
    trace: { emit: over.emit ?? ((e) => void entries.push(e)) },
    harness: 'claude',
    now: () => (clock += 250),
  });

  holder.onTrace = traced.onTrace as never;

  return { llm: traced.llm, entries };
}

describe('traceDirectorLLM', () => {
  it('logs input, prompt, raw output, parsed result, cost, duration, model and harness', async () => {
    const { llm, entries } = rig(async (onTrace, _n, _i, opts) => {
      onTrace({ prompt: 'PROMPT TEXT', raw: '{"a":1}', exit: 'code 0', tail: '' });
      opts.onCost?.(0.01);
      opts.onCost?.(0.02);

      return ok({ a: 1 });
    });

    const costs: number[] = [];
    const r = await llm.step('triage', { ticket: { id: 'FX-1' }, text: 'x' }, Out, {
      ...OPTS,
      onCost: (u) => costs.push(u),
    });

    expect(r).toEqual(ok({ a: 1 }));
    expect(costs).toEqual([0.01, 0.02]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'director_step',
      step: 'triage',
      actor: 'director',
      level: 'info',
      ticket_id: 'FX-1',
    });

    expect(entries[0]?.data).toMatchObject({
      input: { ticket: { id: 'FX-1' }, text: 'x' },
      prompt: 'PROMPT TEXT',
      raw: '{"a":1}',
      parsed: { a: 1 },
      cost_usd: 0.03,
      model: 'haiku',
      harness: 'claude',
      budget_usd: 0.1,
    });

    expect((entries[0]?.data as { duration_ms: number }).duration_ms).toBeGreaterThan(0);
  });

  it('logs a failed step with the raw output and the error', async () => {
    const { llm, entries } = rig(async (onTrace) => {
      onTrace({ prompt: 'P', raw: 'not json at all', exit: 'code 1', tail: 'tail' });

      return err({ kind: 'invalid_output', message: 'a: expected number' });
    });

    const r = await llm.step('card_survey', { card: { id: 'FX-C1' } }, Out, OPTS);

    expect(r.ok).toBe(false);
    expect(entries[0]).toMatchObject({
      level: 'warn',
      card_id: 'FX-C1',
      step: 'card_survey',
    });

    expect(entries[0]?.message).toContain('invalid_output');
    expect(entries[0]?.data).toMatchObject({
      raw: 'not json at all',
      error: { kind: 'invalid_output', message: 'a: expected number' },
    });
  });

  it('keeps the prompts of steps running at the same time apart', async () => {
    const { llm, entries } = rig(async (onTrace, name) => {
      await new Promise((r) => setTimeout(r, name === 'triage' ? 20 : 1));
      onTrace({ prompt: `prompt of ${name}`, raw: name, exit: 'x', tail: '' });

      return ok({ a: 1 });
    });

    await Promise.all([
      llm.step('triage', {}, Out, OPTS),
      llm.step('steer_reply', {}, Out, OPTS),
    ]);

    const byStep = Object.fromEntries(
      entries.map((e) => [e.step, (e.data as { prompt: string }).prompt]),
    );

    expect(byStep).toEqual({
      triage: 'prompt of triage',
      steer_reply: 'prompt of steer_reply',
    });
  });

  it('still returns the result when the sink throws', async () => {
    const { llm } = rig(async () => ok({ a: 2 }), {
      emit: () => {
        throw new Error('sink down');
      },
    });

    expect(await llm.step('triage', {}, Out, OPTS)).toEqual(ok({ a: 2 }));
  });

  it('exposes the wrapped capabilities', () => {
    const { llm } = rig(async () => ok({ a: 1 }));

    expect(llm.capabilities()).toEqual({ structuredOutput: true, reportsCost: true });
  });
});
