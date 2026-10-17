/**
 * A scripted Director that plans a card: one failed survey, one grill question, one plan.
 *
 * Why: the trace end-to-end test must drive the production planning flow (survey, grill, verify,
 *   enhance, plan, approve) without a model, through the same output schemas a real model's
 *   answers pass. The first survey answer is off-schema on purpose so the trace has a failed
 *   step to show, and like the real Claude adapter every call reports its prompt and raw output
 *   through the `onTrace` callback the server hands to the model factory.
 *
 * Exports: planningDirector().
 * Depends on: @forge/core (DirectorLLM, ok, err), types/server (LlmFactory). No IO.
 */

import { err, ok } from '@forge/core';
import type { DirectorLLM, StepName, StepOptions } from '@forge/core';
import type { ZodType } from 'zod';
import type { LlmFactory } from '#/types/server.types.js';

const plan = {
  summary: 'One ticket.',
  goal: 'An add function',
  scope: ['add(a, b)'],
  non_goals: [],
  assumptions: [],
  risks: [],
  tickets: [
    {
      key: 't1',
      title: 'Add an add function',
      body: 'Add add(a, b) to src/math.js and a test for it, then call finish with claims.',
      acceptance: ['add(1, 2) is 3'],
      priority: 'normal',
      depends_on: [],
      lane: 'express',
      size: 'S',
      files: ['src/math.js', 'test/math.test.js'],
    },
  ],
  card_links: [],
};

const answers = (calls: Map<StepName, number>): Partial<Record<StepName, unknown>> => ({
  card_survey:
    calls.get('card_survey') === 1
      ? { oops: 1 }
      : { findings: { summary: 'A tiny repo.', predicted_lane: 'express' } },
  grill_turn:
    calls.get('grill_turn') === 1
      ? {
          done: false,
          question: {
            text: 'Where should add live?',
            why: 'It decides the file.',
            options: [
              { label: 'src/math.js', recommended: true },
              { label: 'a new file', recommended: false },
            ],
          },
          open_points: 1,
          assumptions: [],
        }
      : { done: true, done_reason: 'nothing_open', open_points: 0, assumptions: [] },
  verify: { findings: { summary: 'Nothing conflicts.', blast_radius: 'one file' } },
  enhance: {
    summary: 'Fine.',
    report: '# Enhance',
    assumptions: [],
    owner_questions: [],
  },
  write_plan: plan,
  approve_plan: { decision: 'approve', questions: [] },
  dispatch_prompt: {
    prompt:
      'Add add(a, b) to src/math.js and a test for it, then call finish with claims.',
  },
  steer_reply: { mode: 'none', text: '' },
  card_chat: { reply: 'Noted.', actions: [] },
  ticket_answer: { decision: 'escalate', confidence: 0.1, grounds: [] },
  ticket_recover: { decision: 'escalate', diagnosis: 'Needs a person.', confidence: 0.1 },
});

/** The model factory for `startE2eRig({ llm })`. */
export function planningDirector(): LlmFactory {
  return (wiring) => {
    const calls = new Map<StepName, number>();
    const llm: DirectorLLM = {
      capabilities: () => ({ structuredOutput: true, reportsCost: true }),
      async step<T>(
        name: StepName,
        input: unknown,
        schema: ZodType<T>,
        opts: StepOptions,
      ) {
        calls.set(name, (calls.get(name) ?? 0) + 1);
        const answer = answers(calls)[name];
        wiring.onTrace?.({
          step: name,
          prompt: `PROMPT ${name} ${JSON.stringify(input).slice(0, 4000)}`,
          raw: JSON.stringify(answer),
          exit: 'code 0, signal null',
          tail: '',
        });

        opts.onCost?.(0.001);
        const parsed = schema.safeParse(answer);

        return parsed.success
          ? ok(parsed.data)
          : err({ kind: 'invalid_output', message: parsed.error.message });
      },
    };

    return llm;
  };
}
