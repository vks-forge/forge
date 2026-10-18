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
  card_chat: { reply: 'Noted.', actions: [] },
  // The e2e card is a fast-path card: planning steps never run, so these only complete the record.
  card_survey: { findings: { summary: 'n/a' } },
  grill_turn: {
    done: true,
    done_reason: 'zero_question',
    open_points: 0,
    assumptions: [],
  },
  verify: { findings: { summary: 'n/a', blast_radius: 'n/a' } },
  enhance: { summary: 'n/a', report: 'n/a', assumptions: [], owner_questions: [] },
  write_plan: {
    summary: 'n/a',
    goal: 'n/a',
    scope: [],
    non_goals: [],
    assumptions: [],
    risks: [],
    tickets: [],
    card_links: [],
  },
  approve_plan: { decision: 'approve', questions: [] },
  custom_step: { summary: 'n/a', notes: [] },
  // Unscripted escalation steps hand the question or the failure to the owner, so a scenario that
  // does not care about the Director's first look still ends with the owner holding the wait.
  ticket_answer: { decision: 'escalate', confidence: 0.1, grounds: [] },
  ticket_recover: { decision: 'escalate', diagnosis: 'Needs a person.', confidence: 0.1 },
  // Unscripted, the Director pauses on a missing substitute, so the owner holds the wait (never a silent swap).
  pick_substitute: { decision: 'pause', reason: 'No good fit; the owner decides.' },
  ticket_check: {
    verdict: 'pass',
    summary: 'The change meets the plan.',
    acceptance: [{ criterion: 'it works', met: 'yes', evidence: 'src/a.ts:1' }],
    findings: [],
    confidence: 0.9,
  },
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

/** `answers` replace the default answer of a step (a triage that predicts tier B, for instance). */
export function createScriptedDirector(
  answers: Partial<Record<StepName, unknown>> = {},
): ScriptedDirector {
  const calls: ScriptedDirector['calls'] = [];
  const llm: DirectorLLM = {
    capabilities: () => ({ structuredOutput: true, reportsCost: false }),
    async step<T>(name: StepName, input: unknown, schema: ZodType<T>, opts: StepOptions) {
      calls.push({ name, input, opts });
      const parsed = schema.safeParse(name in answers ? answers[name] : ANSWERS[name]);

      return parsed.success
        ? ok(parsed.data)
        : err({ kind: 'invalid_output', message: parsed.error.message });
    },
  };

  return { llm, calls };
}
