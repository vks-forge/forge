/**
 * Wake delta: what changed since the last run, as the prompt step is told.
 *
 * Why: a Worker started again must be told why: a new ticket, an answer to its question, a rework
 *   after failed gates or after the owner sent finished work back, or a retry (with the note the
 *   owner or the Director attached). The delta is built from the wake that started it, so the
 *   resumed Worker gets the owner's words and the gate findings exactly as stored, never a
 *   paraphrase.
 *
 * Exports: wakeDelta().
 * Depends on: @forge/core (Interaction), domain/escalation-answer, types/tick. No IO.
 */

import type { Interaction } from '@forge/core';
import { answerText } from '#/domain/escalation-answer.js';
import type { Candidate } from '#/types/tick.types.js';

/** What changed since the last run, for the prompt step. */
export function wakeDelta(
  c: Candidate,
  answered: Interaction | null,
): Record<string, unknown> {
  if (c.kind === 'new') {
    return { kind: 'new_ticket' };
  }

  if (c.kind === 'resume') {
    return {
      kind: 'response_wake',
      reason: c.wake?.reason ?? 'answered',
      interaction_id: answered?.id ?? null,
      question: answered?.payload ?? null,
      answer: answerText(answered?.answer),
    };
  }

  // A retry the owner (or the Director) asked for carries its note: `<who>_retry: <note>`.
  const asked = /^(owner|director|auto)_retry(?:: (.*))?$/s.exec(c.wake?.reason ?? '');
  if (asked) {
    return {
      kind: 'retry',
      reason: `${asked[1]}_retry`,
      ...(asked[2] ? { note: asked[2] } : {}),
      previous_run: null,
    };
  }

  if (c.wake?.kind === 'continuation') {
    const owner = /^owner_rework: /.test(c.wake.reason);

    return {
      kind: 'rework',
      previous_run: c.wake.idempotency_key,
      ...(owner
        ? { owner_comment: c.wake.reason.replace(/^owner_rework: /, '') }
        : { gate_findings: c.wake.reason.replace(/^gate_failed: /, '') }),
    };
  }

  return {
    kind: 'retry',
    reason: c.wake?.reason ?? 'retry',
    previous_run: c.wake?.idempotency_key ?? null,
  };
}
