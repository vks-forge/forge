/**
 * Planning reply guard: an owner's chat message during planning never goes unanswered.
 *
 * Why: during planning the owner's chat messages go to the planning flow, not to a chat
 *   reply. The flow usually answers with something the owner sees (the next question, a step
 *   starting, a note that a step failed or ran out of budget), but when no step can run the
 *   message would be absorbed with no word back, and the owner is left talking to a card that
 *   looks dead (DCP-C3). The owner always gets an answer or a visible failure (d-0135): this
 *   guard checks that the Director wrote something after the message and, when it did not,
 *   says plainly that the message was kept and nothing ran, and logs a warning so the stall
 *   shows up in the trace.
 *
 * Exports: answerIfSilent().
 * Depends on: tick/planning-state, types/card-planning. Reads and writes storage.
 */

import { logPlanEvent, stamp } from '#/tick/planning-state.js';
import type { PlanCtx } from '#/types/card-planning.types.js';

const SILENT_REPLY =
  'I have your message and kept it as a note for the plan, but no planning step ran after it, so nothing on this card has changed yet.';

/**
 * The owner always gets an answer (d-0135): when a turn that took an owner message wrote nothing
 * from the Director after it (no question, step, note or reply), say so on the card and in the
 * log, instead of leaving the message unanswered.
 */
export async function answerIfSilent(pc: PlanCtx, lastSeq: number): Promise<void> {
  const silent = await pc.ctx.deps.storage.transaction(async (tx) => {
    const after = await tx.cardEvents.list(pc.card.id, { afterSeq: lastSeq, limit: 50 });
    if (after.some((e) => e.actor.type === 'director')) {
      return false;
    }

    await logPlanEvent(tx, pc.card.id, stamp(pc), {
      kind: 'director_message',
      payload: { text: SILENT_REPLY },
    });

    return true;
  });

  if (silent) {
    pc.ctx.deps.log?.('warn', `planning turn on ${pc.card.id} wrote no reply`, {
      after_seq: lastSeq,
    });
  }
}
