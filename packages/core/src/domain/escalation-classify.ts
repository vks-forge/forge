/**
 * Escalation classification — what a parked ticket's reason text and a failed run's denials mean.
 *
 * Why: tickets parked before escalations existed carry only a reason string, and a run that ends
 *   on a login or a denied tool must not look like any other failure. A retry fixes neither: it
 *   fails the same way and burns a run. Two pure rules read what the engine already writes. The
 *   first gives a parked ticket its failure cause (so the start-up sweep can offer "Run as
 *   Express" for a lane hold and "Retry" for a retry cap, and the Merge anyway card for a ticket held
 *   with a `findings_hold:`, `config_hold:`, `provenance_hold:` or `scope_drift:` reason); the second names the setup the owner
 *   must fix (sign in, approve a tool, grant a tool) from the error family and the denials in the
 *   run's receipts. An unknown reason still gets a cause, so no parked ticket is left without a
 *   way forward.
 *
 * Exports: SETUP_DENIAL_REASONS, classifyPark(), failureCauseOf(), setupCauseFor().
 * Depends on: schemas/errors, schemas/escalation, schemas/ticket, types/escalation. No IO.
 */

import type { ErrorFamily } from '#/schemas/errors.js';
import type { DecisionCause, FailureCause } from '#/schemas/escalation.js';
import type { SetupCause } from '#/schemas/escalation-setup.js';
import type { Ticket } from '#/schemas/ticket.js';
import type { DenyDecision, ParkClass, SetupContext } from '#/types/escalation.types.js';

const SUMMARY_CLIP = 300;

/** The denial reasons an owner can fix in settings; every other denial is policy working as intended. */
export const SETUP_DENIAL_REASONS: readonly string[] = [
  'unknown_tool',
  'quarantined',
  'schema_pending',
  'schema_changed',
  'schema_denied',
  'not_granted',
  'unattended',
];

const DECISION_PREFIXES: readonly {
  readonly prefix: string;
  readonly cause: DecisionCause;
}[] = [
  { prefix: 'findings_hold:', cause: 'findings_hold' },
  { prefix: 'config_hold:', cause: 'config_hold' },
  { prefix: 'provenance_hold:', cause: 'provenance_hold' },
  { prefix: 'scope_drift:', cause: 'scope_drift' },
];

const clip = (text: string): string =>
  text.length > SUMMARY_CLIP ? `${text.slice(0, SUMMARY_CLIP - 1)}…` : text;

/** The first rule whose test matches the reason text; the last row is the catch-all. */
const RULES: readonly {
  readonly test: (reason: string) => boolean;
  readonly cause: FailureCause;
}[] = [
  { test: (r) => r.startsWith('merge conflict:'), cause: 'merge_conflict' },
  {
    test: (r) => r.startsWith('pipeline_pending') || r.includes('lane not enabled'),
    cause: 'lane_hold',
  },
  {
    test: (r) =>
      r.includes('automatic rework cap') || /failed after \d+ automatic reworks/.test(r),
    cause: 'rework_cap',
  },
  { test: (r) => r.startsWith('no_agent_available'), cause: 'no_agent_available' },
  { test: (r) => r.includes('re-wake cap'), cause: 'rewake_cap' },
  { test: (r) => r.startsWith('max_turns'), cause: 'max_turns' },
  { test: (r) => r.startsWith('refused'), cause: 'refused' },
  {
    test: (r) => /failed \d+ times \(retry limit/.test(r) || /retries used \(max/.test(r),
    cause: 'retry_cap',
  },
  { test: (r) => r.includes('not retried automatically'), cause: 'not_retried' },
];

/**
 * The failure cause of a parked ticket from its status and reason text; null when the ticket is
 * not parked. A `blocked` ticket is a question that timed out; any other waiting ticket whose
 * reason is not recognised is "not retried", so it still has Retry, Re-plan and Cancel.
 */
export function classifyPark(
  ticket: Pick<Ticket, 'status'> & { readonly blocked_reason?: string | undefined },
): ParkClass | null {
  if (ticket.status !== 'waiting_human' && ticket.status !== 'blocked') {
    return null;
  }

  const reason = ticket.blocked_reason ?? '';
  const summary = clip(reason === '' ? 'The ticket is waiting for you.' : reason);
  if (ticket.status === 'blocked') {
    return { kind: 'failure', cause: 'question_timeout', summary };
  }

  // A held ticket (a stage's findings, work outside its plan) is a decision, not a failure.
  const held = DECISION_PREFIXES.find((d) => reason.startsWith(d.prefix));
  if (held) {
    return { kind: 'decision', cause: held.cause, summary };
  }

  const rule = RULES.find((r) => r.test(reason));

  return { kind: 'failure', cause: rule?.cause ?? 'not_retried', summary };
}

/** The failure cause of a classified park; a held ticket (a decision) or an unparked one has none, so it reads as "not retried". */
export const failureCauseOf = (park: ParkClass | null): FailureCause =>
  park?.kind === 'failure' ? park.cause : 'not_retried';

/**
 * The setup an ended run needs, or null when it is an ordinary failure. `auth` is the harness's
 * login; a `policy_denied` run names the tool whose last fixable denial stopped it (newest
 * denial first). The caller handles a harness build that changed under the approvals itself.
 */
export function setupCauseFor(
  family: ErrorFamily,
  decisions: readonly DenyDecision[],
  context: SetupContext,
): SetupCause | null {
  if (family === 'auth') {
    return { type: 'login', harness_id: context.harness_id };
  }

  if (family !== 'policy_denied') {
    return null;
  }

  const denial = [...decisions]
    .reverse()
    .find((d) => d.decision === 'deny' && SETUP_DENIAL_REASONS.includes(d.reason));

  return denial === undefined
    ? null
    : {
        type: 'tool',
        tool: denial.tool,
        harness_kind: context.harness_kind,
        version: denial.version ?? context.version,
        reason_code: denial.reason,
      };
}
