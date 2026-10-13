/**
 * In-memory `DirectorLLM` for the contract and for engine tests that need a scripted model.
 *
 * Why: the contract is only trustworthy if the simplest possible implementation passes it,
 *   and the Director engine needs a model it can script without a process or a network. The
 *   fake validates what it "answers" with the caller's schema exactly as a real adapter
 *   must, so an off-schema script becomes `invalid_output` and a valid one the typed value.
 *
 * Exports: FakeDirectorLLM, createFakeDirectorLLM().
 * Depends on: @forge/core (ok, err, DirectorLLM), tests/contract/director-llm.contract.
 *   No IO.
 */

import { err, ok } from '@forge/core';
import type { DirectorLLM, StepError, StepName, StepOptions } from '@forge/core';
import { z } from 'zod';
import type { ZodType } from 'zod';
import type { ScriptedResponse } from '#tests/contract/director-llm.contract.js';

export interface FakeDirectorLLM {
  readonly llm: DirectorLLM;
  /** Sets the answer of every following call until replaced. */
  script(response: ScriptedResponse): void;
  /** Every call seen, in order. */
  readonly calls: { name: StepName; input: unknown; opts: StepOptions }[];
}

const FAILURES: Record<string, StepError> = {
  auth: { kind: 'auth', message: 'not logged in' },
  budget: { kind: 'budget', message: 'budget exhausted' },
  refusal: { kind: 'refusal', message: 'declined' },
  crash: { kind: 'crash', message: 'process died' },
};

export function createFakeDirectorLLM(
  now: () => number = () => Date.now(),
): FakeDirectorLLM {
  let scripted: ScriptedResponse = { kind: 'valid', value: { answer: 'ok' } };
  const calls: FakeDirectorLLM['calls'] = [];
  const llm: DirectorLLM = {
    capabilities: () => ({ structuredOutput: true, reportsCost: false }),
    async step<T>(name: StepName, input: unknown, schema: ZodType<T>, opts: StepOptions) {
      calls.push({ name, input, opts });
      if (scripted.kind === 'rate_limit')
        return err({
          kind: 'rate_limit',
          message: 'rate limited',
          retryNotBefore: new Date(now() + 60_000).toISOString(),
        });
      const failure = FAILURES[scripted.kind];
      if (failure) return err(failure);
      const answer = scripted.kind === 'valid' ? scripted.value : { wrong: 1 };
      const parsed = schema.safeParse(answer);
      return parsed.success
        ? ok(parsed.data)
        : err({ kind: 'invalid_output', message: z.prettifyError(parsed.error) });
    },
  };
  return {
    llm,
    calls,
    script(response) {
      scripted = response;
    },
  };
}
