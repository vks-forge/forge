/**
 * Wake delta: what changed since the last run, as the prompt step is told.
 *
 * Why: a Worker started again must be told why: a new ticket, the next stage of its pipeline, an answer to its question, a rework
 *   after failed gates or after the owner sent finished work back, a clash with main to combine, or a retry (with the note the
 *   owner or the Director attached, the escalation it answered and the last findings and run). After tool approvals the delta lists each answer of the run (the exact call, allowed or denied). The delta is built from the wake that started it, so the
 *   resumed Worker gets the owner's words and the gate findings exactly as stored, never a
 *   paraphrase.
 *
 * Exports: wakeDelta().
 * Depends on: @forge/core (Interaction), domain/{conflict-wake,escalation-answer}, types/{approval,retry-context,tick}. No IO.
 */

import type { Interaction } from '@forge/core';
import { parseConflictWake } from '#/domain/conflict-wake.js';
import { answerText } from '#/domain/escalation-answer.js';
import type { ApprovalAnswer } from '#/types/approval.types.js';
import type { RetryContext } from '#/types/retry-context.types.js';
import type { Candidate } from '#/types/tick.types.js';

/** What changed since the last run, for the prompt step. */
export function wakeDelta(
  c: Candidate,
  answered: Interaction | null,
  stage?: { readonly id: string; readonly label: string },
  approvals: readonly ApprovalAnswer[] = [],
  retry: RetryContext | null = null,
): Record<string, unknown> {
  if (c.kind === 'new') {
    return { kind: 'new_ticket' };
  }

  // The next stage of the pipeline: earlier stages already changed this worktree.
  if (c.kind === 'stage') {
    return {
      kind: 'stage',
      stage: stage?.label ?? stage?.id ?? 'the next stage',
      note: 'Earlier stages of this ticket have already passed and changed this worktree (see the changes since the base). Continue from there; do not redo them.',
    };
  }

  if (c.kind === 'resume') {
    return {
      kind: 'response_wake',
      reason: c.wake?.reason ?? 'answered',
      interaction_id: answered?.id ?? null,
      question: answered?.payload ?? null,
      answer: answerText(answered?.answer),
      // The owner's answers to the tool calls this run was waiting on, as stored.
      ...(approvals.length > 0 ? { approvals } : {}),
    };
  }

  // A retry the owner (or the Director) asked for carries its note: `<who>_retry: <note>`.
  const asked = /^(owner|director|auto)_retry(?:: (.*))?$/s.exec(c.wake?.reason ?? '');
  if (asked) {
    return {
      kind: 'retry',
      reason: `${asked[1]}_retry`,
      ...(asked[2] ? { note: asked[2] } : {}),
      // Why the ticket stopped and what the last attempt left behind, as stored (empty with no history).
      ...(retry ?? {}),
      previous_run: retry?.last_run?.run ?? null,
    };
  }

  // Main moved and the branch clashes with it: the files, who changed them first, and the owner's note on a retry.
  const clash = parseConflictWake(c.wake?.reason);
  if (clash) {
    return {
      kind: 'merge_conflict',
      files: clash.files,
      upstream: clash.upstream,
      ...(clash.note ? { note: clash.note } : {}),
      previous_run: c.wake?.idempotency_key.split('~')[0] ?? null,
    };
  }

  if (c.wake?.kind === 'continuation') {
    const owner = /^owner_rework: /.test(c.wake.reason);

    return {
      kind: 'rework',
      previous_run: c.wake.idempotency_key.split('~')[0] ?? c.wake.idempotency_key,
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
