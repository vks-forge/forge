/**
 * Finished-work copy: the plain words for a held decision and a sign-off, and how findings are
 * ordered and placed.
 *
 * Why: when work is done the owner is asked two things: "a check found problems, do you merge
 *   anyway?" and "the checks passed, will you put your name on it?". Both must read the same in
 *   the card chat, on the Ticket page and in the Inbox, so the sentences are chosen once. A
 *   finding is shown worst first with the place it points at (`file:line`), because the owner
 *   decides from the serious ones and needs to open the file. The tier is said in words, never
 *   as a bare letter, and protected files say when the Director signs them itself (every check
 *   passed, no secret file touched) and why one waits for the owner. Pure.
 *
 * Exports: TIER_WORDS, DECISION_LEAD, SIGN_OFF_WHY, indexedBySeverity(), bySeverity(), whereOf(), reworkLine(),
 *   checksLine(), signOffRecommendation(), unplannedLine(),
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
  A: 'Low risk',
  B: 'Moderate risk',
  C: 'Protected files',
};

export const DECISION_LEAD: Readonly<Record<DecisionCause, string>> = {
  findings_hold:
    'A check found problems that block this change. The gates passed. Merging anyway is your call.',
  config_hold:
    'The Worker changed files that control how its work is checked. Review them, then merge anyway or send it back.',
  provenance_hold:
    'Forge cannot prove who made some of these changes: the proof from an earlier run is gone. Check the changes yourself, then merge anyway, or send it back, re-plan or cancel.',
  scope_drift:
    'The change touches files the plan did not name. Carry on only if that is fine with you.',
};

export const SIGN_OFF_WHY: Readonly<Record<SignOffCause, string>> = {
  tier_b: 'This is a moderate-risk change. It waits for your name before it merges.',
  tier_c:
    'This touches protected files. The Director signs these off only when every check passed and no secret file is touched, so this one waits for you.',
  owner_stage: 'This lane asks you to approve before anything merges.',
  director_declined: 'The Director looked first and left the signing to you.',
};

const ORDER: Readonly<Record<Finding['severity'], number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Findings worst first, each with its position in the list the check gave; ties keep that order. */
export function indexedBySeverity(
  findings: readonly Finding[],
): { finding: Finding; index: number }[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort(
      (a, b) =>
        ORDER[a.finding.severity] - ORDER[b.finding.severity] || a.index - b.index,
    );
}

/** Findings worst first; equal severities keep the order the check gave them. */
export function bySeverity(findings: readonly Finding[]): Finding[] {
  return indexedBySeverity(findings).map((entry) => entry.finding);
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

/**
 * The Director's recommendation for a sign-off, led by its evidence: sign off when every check passed, no
 * critical or high finding is open, nothing was overruled and the Director left no objection; otherwise
 * "look closer" with each reason. Only what is on the payload is claimed.
 */
export function signOffRecommendation(
  signOff: Pick<EscalationSignOff, 'checks' | 'director_note' | 'tier'>,
): { verdict: 'sign_off' | 'look_closer'; line: string } {
  const { checks } = signOff;
  const serious = (checks.counts['critical'] ?? 0) + (checks.counts['high'] ?? 0);
  const passed = `${checks.passed} ${checks.passed === 1 ? 'check' : 'checks'} passed`;
  const reasons: string[] = [];

  if (checks.passed === 0) {
    reasons.push('no check is on record as passed.');
  }

  if (serious > 0) {
    reasons.push(
      `${serious} critical/high ${serious === 1 ? 'finding is' : 'findings are'} still open.`,
    );
  }

  if (checks.overrides > 0) {
    reasons.push(
      `you overruled ${checks.overrides} held ${checks.overrides === 1 ? 'finding' : 'findings'}, so the work does not fully match what the checks asked for.`,
    );
  }

  if (signOff.director_note !== undefined) {
    reasons.push('the Director did not sign it off (see its note below).');
  }

  if (reasons.length > 0) {
    return {
      verdict: 'look_closer',
      line: `Recommend: look closer before signing off. ${passed}, but ${reasons.join(' ')}`,
    };
  }

  const protectedNote =
    signOff.tier === 'C'
      ? ' It touches protected files, so look at what changed before you sign.'
      : '';

  return {
    verdict: 'sign_off',
    line: `Recommend: sign off. All checks passed (${checks.passed}), 0 critical/high, matches the plan.${protectedNote}`,
  };
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
