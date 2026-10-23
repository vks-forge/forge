/**
 * Plan to tickets: approving a plan files its tickets (and replaces an earlier plan's untouched ones).
 *
 * Why: approval is the only way tickets come to exist under the card-first flow (d-0129,
 *   d-0133), so it is one function whatever approves (the Director behind the floor, or the
 *   owner). It files the plan's tickets dependencies first (priority urgent 3, high 2, normal 1,
 *   low 0; `blocked_by` mapped from the plan's keys), moves the card through `transitionCard()`,
 *   and gives each ticket its `triaged` event with the stricter of the plan's lane and the
 *   deterministic pre-check of the ticket's own body and files (`plan-ticket-lane`; the reasons of a raise are
 *   written to the card), so a ticket can only be raised, never lowered, unless the owner set its lane
 *   (d-0141 item 9, d-0177), and a ticket touching a Tier C path is Tier C. It is idempotent per (card, version): a double
 *   click or a retry returns the tickets already made. A planned ticket whose lane has no
 *   runner yet (Full, until its pipeline goes live) is held with the wait reason `pipeline_pending`
 *   and a lane-hold escalation offering "Run as Express", Re-plan or Cancel, so the owner always
 *   has a way forward (d-0135); Express and Standard tickets run their lane pipeline. Approving a later version of a re-planned card
 *   also cancels, through `transition()`, the earlier plan's tickets that never started (the core
 *   keep rule); started tickets stay, and the plan keys are recorded next to the ticket ids so the new plan can tell what already exists. After the approval
 *   commits, each replaced ticket's run, worktree and local branch are stopped and removed.
 *
 * Exports: PIPELINE_PENDING, approvePlanTx(), approvePlan().
 * Depends on: @forge/core (plan, lane, phase, keep rules), tick/{plan-impact, plan-ticket-lane, ticket-insert, ticket-moves,
 *   card-phase, card-log, ticket-cancel, escalation-raise, escalation-settle}, types/card-planning. Writes storage.
 */

import { CardId, REPLACEABLE_STATUSES, orderPlanTickets } from '@forge/core';
import type {
  CardActor,
  PlanTicket,
  PlanVersion,
  StorageTx,
  Ticket,
  TicketId,
} from '@forge/core';
import { isLive } from '#/domain/live-lanes.js';
import { iso } from '#/shared/time.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { moveCardTx } from '#/tick/card-phase.js';
import { notifyCard } from '#/tick/card-notify.js';
import { cardKeepStates } from '#/tick/plan-impact.js';
import { planTicketLane } from '#/tick/plan-ticket-lane.js';
import { raiseEscalation } from '#/tick/escalation-raise.js';
import { insertInboxTicket } from '#/tick/ticket-insert.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { stopCancelledAll } from '#/tick/ticket-cancel.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { ApprovePlanResult } from '#/types/card-planning.types.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** The wait reason of a planned ticket whose lane has no pipeline yet. */
export const PIPELINE_PENDING = 'pipeline_pending';

const PRIORITY = { urgent: 3, high: 2, normal: 1, low: 0 } as const;
const PAGE = 200;

/** Cancels the earlier plan's not-started tickets through `transition()` and says so on the card. */
async function cancelReplaced(
  tx: StorageTx,
  cardId: CardId,
  tickets: readonly Ticket[],
  version: number,
  at: string,
  actor: CardActor,
): Promise<Ticket[]> {
  const cancelled: Ticket[] = [];
  for (const t of tickets) {
    const moved = await moveTicketTx(tx, t.id, at, (cur) =>
      REPLACEABLE_STATUSES.includes(cur.status)
        ? { events: [{ type: 'cancelled' }], reason: 'Replaced by a new plan' }
        : null,
    );

    if (moved.ok) {
      cancelled.push(moved.ticket);
    }
  }

  if (cancelled.length > 0) {
    await logCardEvent(tx, cardId, {
      kind: 'note',
      at,
      actor,
      payload: {
        text: `Replaced by plan v${version}: cancelled ${cancelled.map((t) => t.id).join(', ')}.`,
      },
    });
  }

  return cancelled;
}

/** The ticket text a Worker reads: the plan's body, what done looks like and where to look. */
function ticketBody(t: PlanTicket, plan: PlanVersion): string {
  const parts = [t.body];
  if (t.acceptance.length > 0) {
    parts.push(`Acceptance criteria:\n${t.acceptance.map((a) => `- ${a}`).join('\n')}`);
  }

  if (t.files.length > 0) {
    parts.push(`Files: ${t.files.join(', ')}`);
  }

  parts.push(`Part of plan v${plan.version} of card ${plan.card_id} (size ${t.size}).`);

  return parts.join('\n\n');
}

/** The ticket ids an earlier approval of `version` made, or null when it was not approved. */
async function approvedBefore(
  tx: StorageTx,
  cardId: CardId,
  version: number,
): Promise<TicketId[] | null> {
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(cardId, {
      limit: PAGE,
      ...(afterSeq === undefined ? {} : { afterSeq }),
    });

    for (const e of page) {
      if (e.kind === 'plan_approved' && e.payload.version === version) {
        return e.payload.ticket_ids;
      }
    }

    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return null;
    }

    afterSeq = last.seq;
  }
}

/**
 * Approves `version` inside an open transaction: files the tickets, moves the card, logs
 * `plan_approved`. Refusals come back as results and write nothing.
 */
export async function approvePlanTx(
  tx: StorageTx,
  deps: Pick<EngineDeps, 'ids'>,
  cardId: CardId,
  version: number,
  by: 'director' | 'owner',
  at: string,
  tierCGlobs: readonly string[],
  actorId: string,
): Promise<ApprovePlanResult> {
  const card = await tx.cards.get(cardId);
  const project = card ? await tx.projects.get(card.project) : null;
  if (!card || !project) {
    return { status: 'not_found' };
  }

  const before = await approvedBefore(tx, cardId, version);
  if (before) {
    return { status: 'approved', card, ticket_ids: before };
  }

  if (card.phase !== 'plan_ready') {
    return { status: 'phase_mismatch' };
  }

  const plan = await tx.cardPlanning.latestPlan(cardId);
  if (!plan) {
    return { status: 'plan_not_found' };
  }

  if (plan.version !== version) {
    return { status: 'stale_plan' };
  }

  const actor: CardActor = by === 'owner' ? { type: 'user', id: actorId } : ENGINE_ACTOR;

  // A re-plan: tickets of the earlier plan that have not started are replaced by this one.
  const replaced = (await cardKeepStates(tx, cardId))
    .filter((s) => s.replaced)
    .map((s) => s.ticket);

  const made = new Map<string, TicketId>();
  const created: { plan: PlanTicket; id: TicketId }[] = [];
  for (const t of orderPlanTickets(plan.tickets)) {
    const ticket = await insertInboxTicket(tx, project, {
      cardId,
      title: t.title,
      body: ticketBody(t, plan),
      type: 'feat',
      priority: PRIORITY[t.priority],
      blockedBy: t.depends_on.map((d) => made.get(d) as TicketId),
      at,
      actor,
    });

    made.set(t.key, ticket.id);
    created.push({ plan: t, id: ticket.id });
  }

  const moved = await moveCardTx(tx, cardId, { type: 'approve' }, at);
  if (!moved.ok) {
    return { status: 'phase_mismatch' };
  }

  const ids = plan.tickets.map((t) => made.get(t.key) as TicketId);
  await logCardEvent(tx, cardId, {
    kind: 'plan_approved',
    at,
    actor,
    payload: { version, by, ticket_ids: ids, plan_keys: plan.tickets.map((t) => t.key) },
  });

  const cancelled = await cancelReplaced(tx, cardId, replaced, version, at, actor);

  for (const { plan: t, id } of created) {
    const { lane, tierC, note } = planTicketLane(t, tierCGlobs);

    // Only a lane with no runner yet is held; the engine releases the hold once the lane is live.
    const held = !isLive(lane);
    const reason = `${PIPELINE_PENDING}: the ${lane} lane goes live in the next update. Run it as Express to start it now.`;
    const moved = await moveTicketTx(tx, id, at, () => ({
      ...(note === null || held ? {} : { reason: note }),
      events: [
        { type: 'triaged', lane, tier_predicted: tierC ? 'C' : 'A' },
        ...(held ? [{ type: 'parked' as const, reason }] : []),
      ],
    }));

    if (note !== null) {
      await logCardEvent(tx, cardId, {
        kind: 'note',
        at,
        actor,
        payload: { text: `${id}: ${note}` },
      });
    }

    // The hold is an escalation the owner acts on (run as Express, re-plan, cancel), replacing
    // the card-level needs_you note this used to write.
    if (held && moved.ok) {
      await raiseEscalation(
        tx,
        deps,
        at,
        moved.ticket,
        { kind: 'failure', cause: 'lane_hold', summary: reason, attempts: [], lane },
        'owner',
      );
    }
  }

  return {
    status: 'approved',
    card: (await tx.cards.get(cardId)) ?? card,
    ticket_ids: ids,
    cancelled,
  };
}

/** `POST /cards/:id/plan/approve`: the owner approves `version`; it must be the latest and the card must be waiting on it. */
export async function approvePlan(
  deps: EngineDeps,
  state: EngineState,
  cardId: string,
  version: number,
  author: string,
): Promise<ApprovePlanResult> {
  const id = CardId.safeParse(cardId);
  if (!id.success) {
    return { status: 'not_found' };
  }

  const slug = await deps.storage.transaction(async (tx) => {
    const card = await tx.cards.get(id.data);

    return card ? ((await tx.projects.get(card.project))?.slug ?? null) : null;
  });

  if (slug === null) {
    return { status: 'not_found' };
  }

  const globs = (await deps.config.project(slug)).config.project.tier_c_globs;
  const at = iso(deps.clock.now());
  const result = await deps.storage.transaction((tx) =>
    approvePlanTx(tx, deps, id.data, version, 'owner', at, globs, author),
  );

  if (result.status === 'approved') {
    // The replaced tickets' trees and local branches go once the plan is committed (not inside the transaction).
    await stopCancelledAll(deps, state, result.cancelled);
    requestTick(deps, state);
    await notifyCard(deps, id.data);
  }

  return result;
}
