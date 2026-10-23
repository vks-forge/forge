/**
 * Merge checks: asks the merge decision about a ticket's gates and notes any overruled check.
 *
 * Why: the automatic merge door must judge the gates exactly as the owner's approval does
 *   (domain/decide-merge), including a failed G1 the owner overruled, which only the stage rows
 *   show. This reads those rows and the PR head, turns a moved head into "gate again" and any other
 *   refusal into a policy denial, and writes the card note that names an overruled check.
 *
 * Exports: judgeMerge(), noteOverriddenMerge().
 * Depends on: @forge/core (PolicyDeniedError), domain/decide-merge, tick/card-log. IO only through storage.
 */

import { PolicyDeniedError } from '@forge/core';
import type { PrStatus, Ticket } from '@forge/core';
import { decideMerge, describeOverride } from '#/domain/decide-merge.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { GateRows, VerifyTarget } from '#/types/verify.types.js';

/**
 * `regate` when the PR head is not the commit the gates judged, else the card sentence for any
 * overruled check (empty when none). Throws a policy denial when the checks do not allow a merge.
 */
export async function judgeMerge(
  ctx: EngineCtx,
  t: VerifyTarget,
  rows: GateRows,
  status: PrStatus,
): Promise<'regate' | { readonly overrideNote: string }> {
  const stages = await ctx.deps.storage.transaction((tx) =>
    tx.stageRuns.listByTicket(t.ticket.id),
  );

  const decision = decideMerge({
    rows,
    gates: t.runtime.gates,
    stages,
    runId: t.run.id,
    ...(status.state === 'open' ? { targetHead: status.headSha } : {}),
  });

  if (decision.kind === 'pass') {
    return { overrideNote: describeOverride(decision) };
  }

  if (decision.reason === 'head_moved') {
    return 'regate';
  }

  throw new PolicyDeniedError(
    `${t.ticket.id} has no passing verdict for ${decision.gates.join(', ')}; refusing to merge`,
  );
}

/** Puts the overruled-check sentence on the card of a ticket merged on its own. */
export async function noteOverriddenMerge(
  ctx: EngineCtx,
  ticket: Ticket,
  overrideNote: string,
): Promise<void> {
  if (overrideNote === '') {
    return;
  }

  await ctx.deps.storage.transaction((tx) =>
    logCardEvent(tx, ticket.card_id, {
      kind: 'note',
      at: ctx.nowIso,
      actor: ENGINE_ACTOR,
      payload: { text: `${ticket.id} was merged. ${overrideNote}` },
    }),
  );
}
