/**
 * Retry context: what a retried Worker is told about why its ticket stopped.
 *
 * Why: the owner presses Retry on a ticket that stopped for a reason (a review finding, a failed
 *   check, a crash, a question nobody answered). The Worker that runs next sees only a fresh
 *   worktree and the owner's note unless the brief says why the last attempt ended, so it changes
 *   nothing and the same finding returns (CHE-6). This pure function turns the stored facts into
 *   the short, size-capped account the dispatch_prompt step is given.
 *
 * Exports: retryContext(), RETRY_CONTEXT_CAP.
 * Depends on: @forge/core (EscalationPayload), domain/escalation-answer, types/retry-context. No IO.
 */

import { EscalationPayload } from '@forge/core';
import type { StageRun } from '@forge/core';
import { answerText } from '#/domain/escalation-answer.js';
import type { RetryContext, RetryFacts } from '#/types/retry-context.types.js';

/** The most characters of free text the whole context carries. */
export const RETRY_CONTEXT_CAP = 4000;

const cut = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;

const gateFailed = (r: StageRun): boolean =>
  r.outcome.gate?.status === 'failed' || r.outcome.gate?.status === 'error';

/** Blocking findings of the rows, one line each (the words the Worker would have been sent back with). */
function findingLines(rows: readonly StageRun[]): string {
  return rows
    .flatMap((r) =>
      (r.outcome.review?.findings ?? [])
        .filter((f) => f.severity === 'critical' || f.severity === 'high')
        .map((f) => {
          const at =
            f.file === undefined
              ? ''
              : `${f.file}${f.line === undefined ? '' : `:${f.line}`}: `;

          return `- [${f.severity}] ${at}${f.issue} (evidence: ${f.evidence})`;
        }),
    )
    .join('\n');
}

/** The attempts of the newest cycle that said something: findings or a failed gate. */
function lastCycleRows(rows: readonly StageRun[]): StageRun[] {
  const hasFindings = (r: StageRun): boolean =>
    (r.outcome.review?.findings.length ?? 0) > 0;

  const said = rows.filter((r) => hasFindings(r) || gateFailed(r));
  const cycle = Math.max(-1, ...said.map((r) => r.cycle));

  return said.filter((r) => r.cycle === cycle);
}

/** The escalation the retry answered, in words: kind, cause, what it said, the options, the answer. */
function escalationOf(
  row: RetryFacts['escalation'],
): Record<string, unknown> | undefined {
  if (row === null) {
    return undefined;
  }

  const out: Record<string, unknown> = {};
  const parsed = EscalationPayload.safeParse(row.payload);
  if (parsed.success) {
    const p = parsed.data;
    out.kind = p.kind;
    if ('cause' in p) {
      out.cause = p.cause;
    }

    if (p.kind === 'question') {
      out.question = p.text;
      out.options = p.options.map((o) => o.label);
    } else if ('summary' in p) {
      out.summary = p.summary;
    }

    if ('diagnosis' in p && p.diagnosis) {
      out.why_it_stopped = p.diagnosis;
    }
  } else {
    out.kind = row.kind;
  }

  const answer = answerText(row.answer);
  if (answer) {
    out.answer = answer;
  }

  return out;
}

/** The context for a retry brief, or null when nothing is on record (a retry with no history). */
export function retryContext(facts: RetryFacts): RetryContext | null {
  const rows = lastCycleRows(facts.stageRuns);
  const findings = findingLines(rows);
  const gates = rows
    .filter(gateFailed)
    .map(
      (r) =>
        `- ${r.stage_id} gate ${r.outcome.gate?.status} (report: ${r.outcome.gate?.report_ref ?? 'none'})`,
    )
    .join('\n');

  const escalation = escalationOf(facts.escalation);
  const run = facts.lastRun;

  // One budget for the free text, findings first: they are what must change.
  let room = RETRY_CONTEXT_CAP;
  const take = (text: string, share: number): string => {
    const out = cut(text, Math.min(room, share));
    room -= out.length;

    return out;
  };

  const ctx: RetryContext = {};
  if (findings !== '') {
    ctx.findings = take(findings, 2000);
  }

  if (gates !== '') {
    ctx.gate_failures = take(gates, 600);
  }

  if (escalation) {
    for (const key of ['summary', 'question', 'why_it_stopped', 'answer']) {
      const value = escalation[key];
      if (typeof value === 'string') {
        escalation[key] = take(value, 800);
      }
    }

    ctx.escalation = escalation;
  }

  if (run) {
    ctx.last_run = {
      run: run.id,
      ...(run.agent ? { agent: run.agent } : {}),
      outcome: run.error_family ? `${run.status} (${run.error_family})` : run.status,
      ...(run.text ? { text: take(run.text, 800) } : {}),
    };
  }

  return Object.keys(ctx).length === 0 ? null : ctx;
}
