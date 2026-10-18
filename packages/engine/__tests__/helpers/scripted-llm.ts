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
 * Exports: ScriptedLLM, StepCall, fail(), createScriptedLLM().
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
  /** Dollars each following call of `name` reports through `opts.onCost`; 0 reports nothing. */
  cost(name: StepName, usd: number): void;
  /** Runs `hook` while a call of `name` is in flight (before it answers): an owner acting during the model's turn. */
  during(name: StepName, hook: () => Promise<unknown>): void;
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
  card_chat: { reply: 'Noted.', actions: [] },
  card_survey: { findings: { summary: 'Empty repository.', predicted_lane: 'standard' } },
  grill_turn: {
    done: true,
    done_reason: 'zero_question',
    open_points: 0,
    assumptions: [],
  },
  verify: {
    findings: {
      summary: 'Nothing in the way.',
      blast_radius: 'small',
      predicted_files: [],
    },
  },
  // Unscripted, research looks up nothing and reports so: the engine, not the model, decides what counts as evidence.
  research: { findings: { summary: 'Nothing to look up.', claims: [], unanswered: [] } },
  enhance: {
    summary: 'Nothing to add.',
    report: '# Enhance\n\nKeep.',
    assumptions: [],
    owner_questions: [],
  },
  write_plan: {
    summary: 'One ticket.',
    goal: 'Do the card.',
    scope: ['the card'],
    non_goals: [],
    assumptions: [],
    risks: [],
    tickets: [
      {
        key: 't1',
        title: 'Do the card',
        body: 'Do it.',
        acceptance: ['it works'],
        priority: 'normal',
        depends_on: [],
        lane: 'express',
        size: 'S',
        files: ['src/a.ts'],
      },
    ],
    card_links: [],
  },
  approve_plan: { decision: 'approve', questions: [] },
  custom_step: { summary: 'Done.', notes: [] },
  // Unscripted escalation steps hand the question or the failure to the owner, so a scenario that
  // does not care about the Director's first look still ends with the owner holding the wait.
  ticket_answer: { decision: 'escalate', confidence: 0.1, grounds: [] },
  ticket_recover: { decision: 'escalate', diagnosis: 'Needs a person.', confidence: 0.1 },
  // Unscripted, the Director pauses on a missing substitute, so the owner holds the wait (never a silent swap).
  pick_substitute: { decision: 'pause', reason: 'No good fit; the owner decides.' },
  // The Director's check of finished work against its plan: a clean pass unless a scenario scripts otherwise.
  ticket_check: {
    verdict: 'pass',
    summary: 'The change meets the plan.',
    acceptance: [{ criterion: 'it works', met: 'yes', evidence: 'src/a.ts:1' }],
    findings: [],
    confidence: 0.9,
  },
  // Drafting an agent is a button the owner presses; scenarios that do not press it never read this.
  draft_agent: {
    definition: {
      name: 'Drafted',
      description: 'A scripted draft.',
      role: 'reviewer',
      instructions: 'Review.',
      runs_on: {
        harness: 'project_default',
        model: { kind: 'harness_default' },
        fallbacks: [],
      },
      tools: ['read'],
      write_scope: [],
      inputs: [],
      output: ['findings'],
      skills: [],
      memory: { tags: [], include_rejected: true },
      budget: {},
    },
    rationale: 'A scripted draft.',
    questions: [],
  },
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
  const costs = new Map<StepName, number>();
  const hooks = new Map<StepName, () => Promise<unknown>>();

  const llm: DirectorLLM = {
    capabilities: () => ({ structuredOutput: true, reportsCost: true }),
    async step<T>(
      name: StepName,
      input: unknown,
      schema: z.ZodType<T>,
      opts: StepOptions,
    ) {
      calls.push({ name, input: input as Record<string, unknown>, opts });
      await hooks.get(name)?.();
      const spend = costs.get(name) ?? 0;
      if (spend > 0) {
        opts.onCost?.(spend);
      }

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
      if (!parsed.success) {
        return err({ kind: 'invalid_output', message: z.prettifyError(parsed.error) });
      }

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
    cost: (name, usd) => void costs.set(name, usd),
    during: (name, hook) => void hooks.set(name, hook),
  };
}
