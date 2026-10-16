/**
 * Planning sweep: starts planning for cards that should be planned, and nudges unanswered questions.
 *
 * Why: two things about a card in a planning phase must happen without anyone asking. A card
 *   whose type is planned but that has no flow yet (a Discussion converted to a Plan or an
 *   Issue, by the card chat or by the owner on the card page) would otherwise sit in Shaping
 *   with nothing running: one sweep per tick queues its first planning turn, so every path that
 *   makes a card plannable ends in the same flow. And a grill question waits for the owner with
 *   no model call running, so an owner who looked away would leave the card parked unnoticed:
 *   after a day of silence the Director writes a plain note that it is still waiting (d-0112's
 *   idle-card nudge applied to an open question). It never answers for the owner and never closes
 *   the card (d-0141 item 3). Writing the note moves the card's last activity forward, which is
 *   what spaces the next nudge a day later, so no extra state is needed.
 *
 * Exports: NUDGE_AFTER_MS, sweepPlanning().
 * Depends on: @forge/core, tick/card-notify, tick/planning-state. Reads and writes storage.
 */

import type { CardId } from '@forge/core';
import { notifyCard } from '#/tick/card-notify.js';
import { isPlannedType, logPlanEvent } from '#/tick/planning-state.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** How long a card with an open question may sit untouched before it is nudged. */
export const NUDGE_AFTER_MS = 24 * 60 * 60 * 1000;

const PAGE = 200;

/** Queues the first planning turn of planned-type cards that have no flow, and nudges quiet open questions. */
export async function sweepPlanning(ctx: EngineCtx): Promise<void> {
  const touched = await ctx.deps.storage.transaction(async (tx) => {
    const out: CardId[] = [];
    for (const project of await tx.projects.list()) {
      if (project.status === 'archived') {
        continue;
      }

      for (const card of await tx.cards.listByProject(project.id, { limit: PAGE })) {
        if (card.phase !== 'grilling' && card.phase !== 'verifying') {
          continue;
        }

        const type = await tx.cardTypes.get(card.type);
        if (!type || !isPlannedType(type)) {
          continue;
        }

        const planning = await tx.cardPlanning.get(card.id);
        if (planning.flow === null) {
          if ((await tx.cardReplyQueue.listOpen(card.id)).length === 0) {
            await tx.cardReplyQueue.enqueue({
              card_id: card.id,
              event_id: 0,
              reason: 'start_planning',
              enqueued_at: ctx.nowIso,
            });

            out.push(card.id);
          }

          continue;
        }

        const quiet = ctx.now - Date.parse(card.updated_at) >= NUDGE_AFTER_MS;
        if (quiet && planning.grill.current !== null) {
          await logPlanEvent(tx, card.id, ctx.nowIso, {
            kind: 'note',
            payload: {
              text: 'Still waiting for your answer. Answer the question, or choose "use recommendations" to let the Director continue.',
            },
          });

          out.push(card.id);
        }
      }
    }

    return out;
  });

  for (const id of touched) {
    await notifyCard(ctx.deps, id);
  }
}
