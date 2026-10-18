/**
 * Finished-work copy: the plain words for a held decision and a sign-off, and how findings are
 * ordered and placed.
 *
 * Why: when work is done the owner is asked two things: "a check found problems, do you merge
 *   anyway?" and "the checks passed, will you put your name on it?". Both must read the same in
 *   the card chat, on the Ticket page and in the Inbox, so the sentences are chosen once. A
 *   finding is shown worst first with the place it points at (`file:line`), because the owner
 *   decides from the serious ones and needs to open the file. The tier is said in words, never
 *   as a bare letter, and tier C says outright that only the owner signs it. Pure.
 *
 * Exports: TIER_WORDS, DECISION_LEAD, SIGN_OFF_WHY, bySeverity(), whereOf(), reworkLine(),
 *   checksLine(), unplannedLine(),
 *   reviewHeadline().
 * Depends on: domain/stage-view-copy, schemas/escalation, schemas/tickets (types), @forge/core (types).
 */

import type { Finding, Tier } from '@forge/core';
import { countsLine } from '#/domain/stage-view-copy.js';
import type {
  DecisionCause,
  EscalationDecision,
  EscalationSignOff,
  SignOffCause,
} from '#/schemas/escalation.js';
import type { TicketDetail } from '#/schemas/tickets.js';

export const TIER_WORDS: Readonly<Record<Tier, string>> = {
  A: 'Tier A: low risk',
  B: 'Tier B: moderate risk',
  C: 'Tier C: protected files',
};

export const DECISION_LEAD: Readonly<Record<DecisionCause, string>> = {
  findings_hold:
    'A check found problems that block this change. The gates passed. Merging anyway is your call.',
  scope_drift:
    'The change touches files the plan did not name. Carry on only if that is fine with you.',
};

export const SIGN_OFF_WHY: Readonly<Record<SignOffCause, string>> = {
  tier_b: 'This is a moderate-risk change. It waits for your name before it merges.',
  tier_c:
    'This touches protected files. Only you can sign it off; the Director never does.',
  owner_stage: 'This lane asks you to approve before anything merges.',
  director_declined: 'The Director looked first and left the signing to you.',
};

const ORDER: Readonly<Record<Finding['severity'], number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Findings worst first; equal severities keep the order the check gave them. */
export function bySeverity(findings: readonly Finding[]): Finding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort(
      (a, b) =>
        ORDER[a.finding.severity] - ORDER[b.finding.severity] || a.index - b.index,
    )
    .map((entry) => entry.finding);
}

/** `src/a.ts:12`, `src/a.ts`, or nothing when the finding names no file. */
export function whereOf(finding: Pick<Finding, 'file' | 'line'>): string {
  if (finding.file === undefined) {
    return '';
  }

  return finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
}

/** "Sent back 2 of 2 times so far.", or nothing before the first send-back. */
export function reworkLine(rework: EscalationDecision['rework']): string | null {
  return rework.count === 0
    ? null
    : `Sent back ${rework.count} of ${rework.cap} times so far.`;
}

/** "3 checks passed. 1 medium. 1 held finding overruled by you.": what stood behind the sign-off. */
export function checksLine(checks: EscalationSignOff['checks']): string {
  const passed = `${checks.passed} ${checks.passed === 1 ? 'check' : 'checks'} passed`;
  const found = countsLine(checks.counts as Parameters<typeof countsLine>[0]);
  const parts = [passed];

  if (found !== null && found !== 'No findings') {
    parts.push(found);
  }

  if (checks.overrides > 0) {
    parts.push(
      `${checks.overrides} held ${checks.overrides === 1 ? 'finding' : 'findings'} overruled by you`,
    );
  }

  return `${parts.join('. ')}.`;
}

/** The sentence of the banner that leads the owner to the Review tab. */
export function reviewHeadline(
  detail: Pick<TicketDetail, 'ticket' | 'escalations'>,
): string {
  if (
    detail.escalations.some(
      (item) =>
        item.payload.kind === 'decision' &&
        item.stage === 'owner' &&
        item.settled === undefined,
    )
  ) {
    return 'This ticket is held for your decision.';
  }

  return detail.ticket.status === 'needs_signoff'
    ? 'This ticket needs your sign-off.'
    : 'This ticket is ready for your review.';
}

/** "3 files the plan did not name", for the heading above the list. */
export function unplannedLine(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'} the plan did not name`;
}
