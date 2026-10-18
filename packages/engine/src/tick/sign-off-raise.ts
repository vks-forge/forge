/**
 * Sign-off item: the owner's wait for finished work, as one typed interaction.
 *
 * Why: when work finishes and a person must put their name to it (tier B, tier C, a pipeline's human
 *   or sign-off stage, or a sign-off the Director declined) the ticket sits in Review or Needs
 *   sign-off. Until now that was a bare ticket status, so the card chat showed nothing to click and
 *   the Inbox invented its own row (d-0135 wants one item in three places). This writes the same
 *   item every other wait has: its tier, why it did not go through the Director, and what the checks
 *   found (how many passed, findings by severity, overrides), read from the stage rows. The item
 *   starts at the owner: the Director has just had its say, or a person must decide. It is raised
 *   once per wait (a second call finds the pending one), by the merge door when it leaves a ticket
 *   in review, and by the start-up backfill for tickets that were already there.
 *
 * Exports: signOffPayload(), raiseOwnerSignOff(), signOffCause().
 * Depends on: @forge/core (currentCycle, escalation schemas), domain/sign-off-facts, tick/escalation-finished. Writes storage.
 */

import { currentCycle } from '@forge/core';
import type {
  EscalationSignOff,
  SignOffCause,
  StorageTx,
  Ticket,
  Tier,
} from '@forge/core';
import { signOffFacts } from '#/domain/sign-off-facts.js';
import { raiseSignOffTx } from '#/tick/escalation-finished.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Why the owner is asked: tier C always; the Director's decline; a tier B approval; or a pipeline that waits for the owner. */
export function signOffCause(tier: Tier, declined: string | undefined): SignOffCause {
  if (tier === 'C') {
    return 'tier_c';
  }

  if (declined !== undefined) {
    return 'director_declined';
  }

  return tier === 'B' ? 'tier_b' : 'owner_stage';
}

const SUMMARY: Readonly<Record<SignOffCause, string>> = {
  tier_c:
    'This change touches tier C paths (auth, migrations, secrets, billing), so a named person must sign it off.',
  tier_b: 'The checks passed. Approve it to merge, or send it back.',
  owner_stage: 'The pipeline waits for your review before this merges.',
  director_declined:
    'The checks passed, but the Director did not sign this off. It is yours to approve.',
};

/** The sign-off payload for `ticket` at `tier`, with the facts of its checks read from its rows. */
export async function signOffPayload(
  tx: StorageTx,
  ticket: Ticket,
  tier: Tier,
  declined?: string,
): Promise<EscalationSignOff> {
  const snapshot = await tx.ticketPipelines.get(ticket.id);
  const records = await tx.stageRuns.listByTicket(ticket.id);
  const facts = snapshot
    ? signOffFacts(snapshot, records, currentCycle(records))
    : { passed: 0, counts: { critical: 0, high: 0, medium: 0, low: 0 }, overrides: 0 };

  const cause = signOffCause(tier, declined);

  return {
    kind: 'sign_off',
    cause,
    tier,
    summary: SUMMARY[cause],
    ...(declined === undefined ? {} : { director_note: declined }),
    checks: { passed: facts.passed, counts: facts.counts, overrides: facts.overrides },
  };
}

/**
 * Raises the sign-off item for a ticket the merge door left in review or needs sign-off. Nothing is
 * raised when the ticket moved on, or already has a pending wait.
 */
export async function raiseOwnerSignOff(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  tier: Tier,
  declined?: string,
  runId?: string,
): Promise<string | null> {
  const cur = await tx.tickets.get(ticket.id);
  if (!cur || (cur.status !== 'review' && cur.status !== 'needs_signoff')) {
    return null;
  }

  return raiseSignOffTx(
    ctx,
    tx,
    cur,
    await signOffPayload(tx, cur, tier, declined),
    runId,
  );
}
