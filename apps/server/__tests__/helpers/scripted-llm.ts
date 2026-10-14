/**
 * A scripted Director model for the end-to-end tests: triage to Express, a fixed prompt.
 *
 * Why: the engine's three model steps are the only part of a ticket's life that needs a
 *   language model. The end-to-end test must run without one, but its answers still go
 *   through the same output schemas as a real model's, so an engine change that asks for a
 *   different shape fails here. Every call is recorded so a test can assert what the
 *   engine sent (for instance that gate findings reached the rework prompt).
 *
 * Exports: ScriptedDirector, createScriptedDirector().
 * Depends on: @forge/core (DirectorLLM, ok, err). No IO.
 */

import { err, ok } from '@forge/core';
import type { DirectorLLM, StepName, StepOptions } from '@forge/core';
import type { ZodType } from 'zod';

export interface ScriptedDirector {
  readonly llm: DirectorLLM;
  readonly calls: { name: StepName; input: unknown; opts: StepOptions }[];
}

const ANSWERS: Record<StepName, unknown> = {
  triage: {
    lane: 'express',
    confidence: 0.95,
    predicted_files: ['src/math.js', 'test/math.test.js'],
    questions: [],
    type: 'feat',
    tier_predicted: 'A',
    title: 'Add an add function',
  },
  dispatch_prompt: {
    prompt:
      'Add add(a, b) to src/math.js and a test for it, then call finish with claims.',
  },
  steer_reply: { mode: 'none', text: '' },
};

export function createScriptedDirector(): ScriptedDirector {
  const calls: ScriptedDirector['calls'] = [];
  const llm: DirectorLLM = {
    capabilities: () => ({ structuredOutput: true, reportsCost: false }),
    async step<T>(name: StepName, input: unknown, schema: ZodType<T>, opts: StepOptions) {
      calls.push({ name, input, opts });
      const parsed = schema.safeParse(ANSWERS[name]);

      return parsed.success
        ? ok(parsed.data)
        : err({ kind: 'invalid_output', message: parsed.error.message });
    },
  };

  return { llm, calls };
}
