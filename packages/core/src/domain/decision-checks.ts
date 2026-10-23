/**
 * Decision checks — does the written plan keep the owner's grill answers.
 *
 * Why: the engine copies the owner's answers into the plan's `decisions`, but `scope` and
 *   `non_goals` are free model text, and a planner that falls back to its own default can
 *   quietly write a non-goal that undoes what the owner chose (T6 in the eval). The planner
 *   must therefore account for every answer (`decision_checks`, one per answer index), and
 *   the engine does not take "honoured" on trust: a decision the planner says it kept but a
 *   non-goal negates by the same key words is flagged too. A flag only makes approval
 *   stricter (the owner decides, d-0141 item 6); it never blocks the owner.
 *
 * Exports: missingDecisionIndexes(), writePlanOutputFor(), findDecisionConflicts().
 * Depends on: domain/dedupe-statements (word normaliser), schemas/plan, schemas/director-steps. No IO.
 */

import { normaliseStatement } from '#/domain/dedupe-statements.js';
import { WritePlanOutput } from '#/schemas/director-steps.js';
import type { DecisionCheck } from '#/schemas/director-steps.js';
import type { DecisionConflict } from '#/schemas/plan.js';

const NEGATION =
  /\b(no|not|never|without|exclude|excluding|skip|dont|wont|cannot|cant)\b/;

const STOP = new Set([
  'that',
  'this',
  'with',
  'from',
  'will',
  'have',
  'they',
  'their',
  'when',
  'what',
  'into',
  'than',
  'then',
  'only',
  'also',
  'keep',
  'make',
]);

/** The answer's content words (4+ letters, not filler), the "key nouns" a negating non-goal must share. */
function keyWords(text: string): Set<string> {
  return new Set(
    normaliseStatement(text)
      .split(' ')
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

/** The indexes of `0..count-1` that `checks` does not cover, in order. */
export function missingDecisionIndexes(
  count: number,
  checks: readonly DecisionCheck[],
): number[] {
  const seen = new Set(checks.map((c) => c.index));

  return Array.from({ length: count }, (_, i) => i).filter((i) => !seen.has(i));
}

/**
 * `WritePlanOutput` that also requires a check for each of the `count` grill answers; a missing
 * index is an invalid output, which the step runner retries once with the message.
 */
export function writePlanOutputFor(count: number) {
  return WritePlanOutput.superRefine((out, ctx) => {
    const missing = missingDecisionIndexes(count, out.decision_checks);
    if (missing.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['decision_checks'],
        message: `decision_checks must have one entry per grill decision; missing index ${missing.join(', ')}`,
      });
    }
  });
}

/** True when a non-goal says "not" about at least two of the answer's key words. */
function negatedBy(nonGoal: string, words: ReadonlySet<string>): boolean {
  const text = normaliseStatement(nonGoal).replace(/['’]/g, '');
  if (!NEGATION.test(text)) {
    return false;
  }

  const have = new Set(text.split(' '));
  let shared = 0;
  for (const w of words) {
    if (have.has(w)) {
      shared += 1;
    }
  }

  return shared >= 2;
}

/**
 * Every grill answer the planner marked `conflict`, plus every answer it marked honoured that a
 * non-goal negates by key words. Checks pointing outside `decisions` are ignored.
 */
export function findDecisionConflicts(
  decisions: readonly { question: string; answer: string }[],
  checks: readonly DecisionCheck[],
  nonGoals: readonly string[],
): DecisionConflict[] {
  const out: DecisionConflict[] = [];
  decisions.forEach((d, index) => {
    const check = checks.find((c) => c.index === index);
    if (check?.status === 'conflict') {
      out.push({ question: d.question, answer: d.answer, where: check.where });

      return;
    }

    const words = keyWords(d.answer);
    const hit = nonGoals.find((g) => negatedBy(g, words));
    if (hit !== undefined) {
      out.push({ question: d.question, answer: d.answer, where: `non_goals: ${hit}` });
    }
  });

  return out;
}
