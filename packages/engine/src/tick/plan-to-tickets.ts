/**
 * Plan to tickets: approving a plan files its tickets, and a held ticket can be run as Express.
 *
 * Why: approval is the only way tickets come to exist under the card-first flow (d-0129,
 *   d-0133), so it is one function whatever approves (the Director behind the floor, or the
 *   owner). It files the plan's tickets dependencies first (priority urgent 3, high 2, normal 1,
 *   low 0; `blocked_by` mapped from the plan's keys), moves the card through `transitionCard()`,
 *   and gives each ticket its `triaged` event with the stricter of the plan's lane and the
 *   deterministic pre-check, so a ticket can only be raised, never lowered (d-0141 item 9), and
 *   a ticket touching a Tier C path is Tier C. It is idempotent per (card, version): a double
 *   click or a retry returns the tickets already made. Only Express runs today, so a planned
 *   Standard or Full ticket is held with the wait reason `pipeline_pending` and an event offering
 *   "Run as Express", so the owner always has a way forward until pipelines exist (d-0135).
 *
 * Exports: PIPELINE_PENDING, approvePlanTx(), approvePlan(), runAsExpress().
 * Depends on: @forge/core (plan, lane and phase rules), tick/ticket-insert, tick/ticket-moves,
 *   tick/card-phase, tick/card-log, tick/planning-state, types/card-planning. Writes storage.
 */

import { CardId, maxLane, orderPlanTickets, preCheckLane, globMatch } from '@forge/core';
import type {
  CardActor,
  PlanTicket,
  PlanVersion,
  StorageTx,
  TicketId,
} from '@forge/core';
import { iso } from '#/shared/time.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { moveCardTx } from '#/tick/card-phase.js';
import { notifyCard } from '#/tick/card-notify.js';
import { logPlanEvent } from '#/tick/planning-state.js';
import { insertInboxTicket } from '#/tick/ticket-insert.js';
import { moveTicket, moveTicketTx } from '#/tick/ticket-moves.js';
import { requestTick } from '#/tick/tick-requests.js';
import type {
  ApprovePlanResult,
  RunAsExpressResult,
} from '#/types/card-planning.types.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** The wait reason of a planned ticket whose lane has no pipeline yet. */
export const PIPELINE_PENDING = 'pipeline_pending';

const PRIORITY = { urgent: 3, high: 2, normal: 1, low: 0 } as const;
const PAGE = 200;

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
    payload: { version, by, ticket_ids: ids },
  });

  for (const { plan: t, id } of created) {
    const lane = maxLane(
      t.lane,
      preCheckLane({
        touchedPaths: t.files,
        tierCGlobs,
        bodyLength: ticketBody(t, plan).length,
        type: 'feat',
      }).lane,
    );

    const tierC = t.files.some((f) => tierCGlobs.some((g) => globMatch(g, f, true)));
    const held = lane !== 'express';
    const reason = `${PIPELINE_PENDING}: the ${lane} lane has no pipeline yet. Run it as Express to start it now.`;
    await moveTicketTx(tx, id, at, () => ({
      events: [
        { type: 'triaged', lane, tier_predicted: tierC ? 'C' : 'A' },
        ...(held ? [{ type: 'parked' as const, reason }] : []),
      ],
    }));

    if (held) {
      await logPlanEvent(tx, cardId, at, {
        kind: 'needs_you',
        payload: { reason, actions: ['run_as_express'], ticket_id: id },
      });
    }
  }

  return {
    status: 'approved',
    card: (await tx.cards.get(cardId)) ?? card,
    ticket_ids: ids,
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
    approvePlanTx(tx, id.data, version, 'owner', at, globs, author),
  );

  if (result.status === 'approved') {
    requestTick(deps, state);
    await notifyCard(deps, id.data);
  }

  return result;
}

/** `POST /tickets/:id/run-as-express`: releases a ticket held for a pipeline into the Express lane, through `transition()`. */
export async function runAsExpress(
  deps: EngineDeps,
  state: EngineState,
  ticketId: string,
  author: string,
): Promise<RunAsExpressResult> {
  const at = iso(deps.clock.now());
  const existing = await deps.storage.transaction((tx) =>
    tx.tickets.get(ticketId as TicketId),
  );

  if (!existing) {
    return { status: 'not_found' };
  }

  const moved = await moveTicket(deps.storage, ticketId, at, (t) =>
    t.status === 'waiting_human' && (t.blocked_reason ?? '').startsWith(PIPELINE_PENDING)
      ? { events: [{ type: 'unparked' }], fields: { lane: 'express' } }
      : null,
  );

  if (!moved.ok) {
    return { status: 'not_held' };
  }

  await deps.storage.transaction((tx) =>
    logCardEvent(tx, moved.ticket.card_id, {
      kind: 'note',
      at,
      actor: { type: 'user', id: author },
      payload: { text: `${ticketId} was released to run as Express.` },
    }),
  );

  requestTick(deps, state);
  if (moved.ticket.card_id) {
    await notifyCard(deps, moved.ticket.card_id);
  }

  return { status: 'released', ticket: moved.ticket };
}
