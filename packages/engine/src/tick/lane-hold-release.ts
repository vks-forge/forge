/**
 * Lane-hold release: lets a held ticket go the moment its lane goes live.
 *
 * Why: a ticket whose lane had no runner was parked with a lane-hold escalation (d-0135), and the
 *   owner's only ways out were to run it as Express, re-plan or cancel. When a build makes a lane
 *   live (Standard in this one), those held tickets must not wait for a person to notice: each
 *   pending lane hold whose lane is live now is settled as `pipeline_ready` by the engine
 *   itself, and the ticket is released through `transition()` (`unparked`, back to planned) so
 *   the next dispatch starts it on its lane's pipeline. A lane that is still not live (Full)
 *   keeps its hold and its actions untouched. The owner is told on the card, not asked.
 *
 * Exports: releaseLaneHolds().
 * Depends on: @forge/core (toEscalation), domain/live-lanes, tick/{card-log,card-notify,escalation-settle,
 *   ticket-moves,tick-config,tick-requests}. Writes storage.
 */

import { toEscalation } from '@forge/core';
import type { Ticket } from '@forge/core';
import { isLive } from '#/domain/live-lanes.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { notifyCard } from '#/tick/card-notify.js';
import { settleEscalation } from '#/tick/escalation-settle.js';
import { isUnservable } from '#/tick/tick-config.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Releases every pending lane hold whose lane is live; no-op when there is none. */
export async function releaseLaneHolds(ctx: EngineCtx): Promise<void> {
  const { deps } = ctx;
  const released = await deps.storage.transaction(async (tx) => {
    const out: Ticket[] = [];
    for (const row of await tx.interactions.listPending()) {
      const view = toEscalation(row);
      if (view.payload.kind !== 'failure' || view.payload.cause !== 'lane_hold') {
        continue;
      }

      const ticket = await tx.tickets.get(row.ticket_id as Ticket['id']);
      if (!ticket || ticket.status !== 'waiting_human' || !isLive(ticket.lane)) {
        continue;
      }

      const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
      if (isUnservable(ctx.config, slug)) {
        continue;
      }

      const card = row.card_id ?? ticket.card_id;
      const settled = await settleEscalation(
        tx,
        ctx.nowIso,
        { ...row, card_id: card },
        { action: 'pipeline_ready', by: 'auto' },
      );

      // Settle first: the move below closes any wait still pending as "ticket moved on".
      if (!settled) {
        continue;
      }

      const moved = await moveTicketTx(tx, ticket.id, ctx.nowIso, (t) =>
        t.status === 'waiting_human'
          ? {
              events: [{ type: 'unparked' }],
              reason: 'The pipeline for its lane is ready, so it continued',
            }
          : null,
      );

      if (!moved.ok) {
        throw new Error(`could not release ${ticket.id}: ${moved.reason}`);
      }

      await logCardEvent(tx, moved.ticket.card_id, {
        kind: 'note',
        at: ctx.nowIso,
        actor: ENGINE_ACTOR,
        payload: {
          text: `${ticket.id} was held for the ${ticket.lane} lane, which is live now; it was released and will run.`,
        },
      });

      out.push(moved.ticket);
    }

    return out;
  });

  for (const ticket of released) {
    deps.log?.(
      'info',
      `lane hold of ${ticket.id} released: the ${ticket.lane} lane is live`,
    );

    if (ticket.card_id) {
      await notifyCard(deps, ticket.card_id);
    }
  }

  if (released.length > 0) {
    requestTick(deps, ctx.state);
  }
}
