/**
 * Owner grill actions: answer the open question, or cut the grill short.
 *
 * Why: the grill waits for the owner (d-0130), and the owner needs more than one way to move
 *   it: click an option or write their own answer, take the Director's recommendations for
 *   everything left, or say "enough" and let the unanswered points become plan assumptions.
 *   These are engine doors the HTTP routes call; each is one transaction that records the
 *   answer as a card event, updates the stored grill state, clears the Needs-you flag and queues
 *   the Director's next turn, so a restart between the click and the turn loses nothing. A wrong
 *   moment is a normal answer (`question_not_open`, `phase_mismatch`), never a thrown error.
 *
 * Exports: answerGrill(), grillShortcut().
 * Depends on: @forge/core (grill schemas), tick/planning-grill, tick/planning-state,
 *   tick/card-notify, tick/tick-requests, types/card-planning. Writes storage.
 */

import { CardId } from '@forge/core';
import type { Card, GrillAnswer, GrillDoneReason } from '@forge/core';
import { iso } from '#/shared/time.js';
import { notifyCard } from '#/tick/card-notify.js';
import { recordAnswerTx } from '#/tick/planning-grill.js';
import { logPlanEvent, mergeUnique, setNeedsYou } from '#/tick/planning-state.js';
import { requestTick } from '#/tick/tick-requests.js';
import type {
  AnswerGrillInput,
  AnswerGrillResult,
  GrillShortcutKind,
  GrillShortcutResult,
} from '#/types/card-planning.types.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

const RECOMMENDED_ASSUMPTION =
  "The remaining open points use the Director's recommendations.";

const isShaping = (card: Card): boolean =>
  card.phase === 'grilling' || card.phase === 'verifying';

/** `POST /cards/:id/grill/answer`: answers the open question and queues the Director's next turn. */
export async function answerGrill(
  deps: EngineDeps,
  state: EngineState,
  cardId: string,
  input: AnswerGrillInput,
  author: string,
): Promise<AnswerGrillResult> {
  const id = CardId.safeParse(cardId);
  if (!id.success) {
    return { status: 'not_found' };
  }

  const at = iso(deps.clock.now());
  const result = await deps.storage.transaction(
    async (tx): Promise<AnswerGrillResult> => {
      const card = await tx.cards.get(id.data);
      if (!card) {
        return { status: 'not_found' };
      }

      const { grill } = await tx.cardPlanning.get(card.id);
      const open = grill.current;
      if (!open || open.question_id !== input.question_id || !isShaping(card)) {
        return { status: 'question_not_open' };
      }

      const hasOption = input.option_id !== undefined;
      const hasText = input.text !== undefined && input.text.trim() !== '';
      if (hasOption === hasText) {
        return {
          status: 'invalid_answer',
          reason: 'give exactly one of option_id and text',
        };
      }

      if (hasOption && !open.options.some((o) => o.id === input.option_id)) {
        return {
          status: 'invalid_answer',
          reason: `option ${input.option_id} is not one of the choices`,
        };
      }

      const answer: GrillAnswer = {
        question_id: open.question_id,
        ...(hasOption
          ? { option_id: input.option_id as string }
          : { text: (input.text as string).trim() }),
        by: 'owner',
      };

      const event = await recordAnswerTx(tx, card.id, grill, answer, at, author);
      await tx.cardReplyQueue.enqueue({
        card_id: card.id,
        event_id: event.seq,
        reason: 'grill_answer',
        enqueued_at: at,
      });

      return { status: 'answered', card: (await tx.cards.get(card.id)) ?? card };
    },
  );

  if (result.status === 'answered') {
    state.chat.pending.add(result.card.id);
    requestTick(deps, state);
    await notifyCard(deps, result.card.id);
  }

  return result;
}

/** The recommended option of a draft or question, or its first option. */
const recommended = <O extends { recommended: boolean }>(
  options: readonly O[],
): O | undefined => options.find((o) => o.recommended) ?? options[0];

/** `POST /cards/:id/grill/shortcut`: take the recommendations, or write the plan now with open points as assumptions. */
export async function grillShortcut(
  deps: EngineDeps,
  state: EngineState,
  cardId: string,
  kind: GrillShortcutKind,
  author: string,
): Promise<GrillShortcutResult> {
  const id = CardId.safeParse(cardId);
  if (!id.success) {
    return { status: 'not_found' };
  }

  const at = iso(deps.clock.now());
  const result = await deps.storage.transaction(
    async (tx): Promise<GrillShortcutResult> => {
      const card = await tx.cards.get(id.data);
      if (!card) {
        return { status: 'not_found' };
      }

      if (!isShaping(card)) {
        return { status: 'phase_mismatch' };
      }

      let { grill } = await tx.cardPlanning.get(card.id);
      let seq = 0;
      const open = grill.current;
      const assumptions: string[] = [];
      if (kind === 'use_recommendations') {
        if (open) {
          const pick = recommended(open.options);
          seq = (
            await recordAnswerTx(
              tx,
              card.id,
              grill,
              {
                question_id: open.question_id,
                option_id: pick?.id ?? 'o1',
                by: 'recommendation',
              },
              at,
              author,
            )
          ).seq;

          grill = (await tx.cardPlanning.get(card.id)).grill;
        }

        grill = {
          ...grill,
          answers: [
            ...grill.answers,
            ...grill.queued.map((q, i) => ({
              question_id: `r${i + 1}`,
              question: q.text,
              answer: recommended(q.options)?.label ?? '',
              by: 'recommendation' as const,
            })),
          ],
        };

        assumptions.push(RECOMMENDED_ASSUMPTION);
      } else {
        assumptions.push(
          ...[open?.text, ...grill.queued.map((q) => q.text)]
            .filter((t): t is string => t !== undefined)
            .map((t) => `Not answered (the owner chose to write the plan now): ${t}`),
        );
      }

      const merged = mergeUnique(grill.assumptions, assumptions);
      const reason: GrillDoneReason =
        kind === 'use_recommendations' ? 'use_recommendations' : 'owner_enough';

      if (!grill.done) {
        await logPlanEvent(tx, card.id, at, {
          kind: 'grill_done',
          payload: { reason, assumptions: merged },
        });
      }

      await tx.cardPlanning.update(card.id, {
        grill: {
          ...grill,
          current: null,
          queued: [],
          open_points: null,
          done: true,
          done_reason: grill.done_reason ?? reason,
          assumptions: merged,
        },
      });

      await setNeedsYou(tx, card.id, false, at);
      await tx.cardReplyQueue.enqueue({
        card_id: card.id,
        event_id: seq,
        reason: 'grill_answer',
        enqueued_at: at,
      });

      return { status: 'applied', card: (await tx.cards.get(card.id)) ?? card };
    },
  );

  if (result.status === 'applied') {
    state.chat.pending.add(result.card.id);
    requestTick(deps, state);
    await notifyCard(deps, result.card.id);
  }

  return result;
}
