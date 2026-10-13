/**
 * Scripted DirectorLLM for engine scenario tests.
 *
 * Why: the engine decides what to do with a step's answer, not how the answer is produced.
 *   This fake returns whatever a scenario scripts per step (a triage verdict, an off-schema
 *   blob, a rate-limit error) and validates it against the step's schema exactly as the real
 *   adapter does, so "invalid output is retried once with the validation error" is tested
 *   through the same port. It records every call so scenarios can assert on the input the
 *   engine built (memory slice, pre-check reasons, the validation error on a retry).
 *
 * Exports: ScriptedLLM, StepCall, createScriptedLLM().
 * Depends on: @forge/core (DirectorLLM, StepError, schemas), zod. No IO.
 */

import { err, ok } from '@forge/core';
import type { DirectorLLM, StepError, StepName, StepOptions } from '@forge/core';
import { z } from 'zod';

export interface StepCall {
  readonly name: StepName;
  readonly input: Record<string, unknown>;
  readonly opts: StepOptions;
}

type Scripted = unknown | StepError | ((input: Record<string, unknown>) => unknown);

export interface ScriptedLLM {
  readonly llm: DirectorLLM;
  readonly calls: StepCall[];
  /** Queues answers for a step; each call consumes one, the last one repeats. Use `fail()` for a StepError. */
  script(name: StepName, ...answers: Scripted[]): void;
  callsTo(name: StepName): StepCall[];
}

const DEFAULTS: Record<StepName, Scripted> = {
  triage: {
    lane: 'express',
    confidence: 0.9,
    predicted_files: ['src/a.ts'],
    questions: [],
    type: 'fix',
    tier_predicted: 'A',
    title: 'Scripted triage title',
  },
  dispatch_prompt: { prompt: 'Do the ticket.' },
  steer_reply: { mode: 'steer', text: 'Please also update the docs.' },
};

/** Marks a scripted answer as a failure rather than a value. */
export const fail = (error: StepError): StepError & { __fail: true } => ({
  ...error,
  __fail: true,
});

const isFail = (v: unknown): v is StepError & { __fail: true } =>
  typeof v === 'object' && v !== null && '__fail' in v;

export function createScriptedLLM(): ScriptedLLM {
  const calls: StepCall[] = [];
  const queues = new Map<StepName, Scripted[]>();

  const llm: DirectorLLM = {
    capabilities: () => ({ structuredOutput: true, reportsCost: true }),
    async step<T>(
      name: StepName,
      input: unknown,
      schema: z.ZodType<T>,
      opts: StepOptions,
    ) {
      calls.push({ name, input: input as Record<string, unknown>, opts });
      const queue = queues.get(name);
      const head =
        queue && queue.length > 1 ? queue.shift() : (queue?.[0] ?? DEFAULTS[name]);
      const answer =
        typeof head === 'function' ? head(input as Record<string, unknown>) : head;
      if (isFail(answer)) {
        const { __fail: _f, ...error } = answer;
        void _f;
        return err(error);
      }
      const parsed = schema.safeParse(answer);
      if (!parsed.success)
        return err({ kind: 'invalid_output', message: z.prettifyError(parsed.error) });
      return ok(parsed.data);
    },
  };

  return {
    llm,
    calls,
    script(name, ...answers) {
      queues.set(name, [...answers]);
    },
    callsTo: (name) => calls.filter((c) => c.name === name),
  };
}
