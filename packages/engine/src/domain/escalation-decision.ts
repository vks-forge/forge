/**
 * Escalation decisions — when the Director may answer a Worker alone, and when it may retry.
 *
 * Why: a model's answer becomes a decision about the owner's project here, so every safeguard is
 *   code, not prompt. The Director answers alone only when the model chose to answer, is at least
 *   as sure as the owner's threshold, cited something it relied on, the ticket is not Tier C
 *   (predicted, or by a planned file on a Tier C path) and the owner did not ask to approve
 *   everything; the owner's settings can only make this stricter, never switch a safeguard off
 *   (d-0141 items 6 and 8). Anything else goes to the owner with the reason in words. It may retry
 *   a failed ticket itself only as many times as the owner allowed.
 *
 * Exports: canAutoAnswer(), touchesTierC(), directorMayRetry().
 * Depends on: @forge/core (TicketAnswerOutput, globMatch, Tier), types/escalation. No IO.
 */

import { globMatch } from '@forge/core';
import type { Tier, TicketAnswerOutput } from '@forge/core';
import type { AnswerGuard, AnswerVerdict } from '#/types/escalation.types.js';

const REASON_NOTES: Readonly<Record<string, string>> = {
  low_confidence: 'The Director was not sure enough to answer alone.',
  out_of_plan: 'The question goes beyond the plan, so the choice is yours.',
  owner_preference: 'This is a product choice, so the Director left it to you.',
  conflict: 'The plan and a decision disagree, so the Director left it to you.',
  tier_c: 'This is Tier C work: a person decides every question on it.',
};

const no = (note: string): AnswerVerdict => ({ answer: false, note });

/** Whether the model's answer may be given to the Worker as it is; otherwise, the note that goes to the owner. */
export function canAutoAnswer(
  out: TicketAnswerOutput,
  guard: AnswerGuard,
): AnswerVerdict {
  if (guard.tierC) {
    return no(REASON_NOTES['tier_c'] as string);
  }

  if (guard.approvalMode === 'always_ask') {
    return no('You asked to approve everything, so the Director did not answer.');
  }

  if (out.decision !== 'answer' || out.answer === undefined) {
    return no(
      (out.escalate_reason && REASON_NOTES[out.escalate_reason]) ||
        REASON_NOTES['low_confidence'] ||
        '',
    );
  }

  if (out.confidence < guard.threshold) {
    return no(
      `The Director was not sure enough to answer alone (confidence ${out.confidence.toFixed(2)}, it needs ${guard.threshold}).`,
    );
  }

  if (out.grounds.length === 0) {
    return no('The Director had an answer but no source to cite for it.');
  }

  return { answer: true, text: out.answer };
}

/** Whether the ticket is Tier C: predicted so, or a planned file on a Tier C path. */
export function touchesTierC(
  predicted: Tier,
  plannedFiles: readonly string[],
  tierCGlobs: readonly string[],
): boolean {
  return (
    predicted === 'C' ||
    plannedFiles.some((f) => tierCGlobs.some((g) => globMatch(g, f, true)))
  );
}

/** Whether the Director may retry once more: it has made fewer retries for this cause than the owner allowed. */
export function directorMayRetry(used: number, max: number): boolean {
  return used < max;
}
