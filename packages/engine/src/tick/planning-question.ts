/**
 * Grill question helpers: the draft turned into the question the card shows, and the cost of the turn.
 *
 * Why: the grill step asks one question per model turn, and the model's draft is not what the owner
 *   sees: options are numbered, the question gets its own id, and the open-point count rides along.
 *   The turn's cost goes to the card through the one Director spend door (ledger row plus cached
 *   total plus budget heads-up), whether or not the question was finally asked, because the model
 *   was paid either way.
 *
 * Exports: toQuestion(), spendOnQuestion().
 * Depends on: @forge/core (grill schemas), tick/card-budget, types/card-planning. Writes inside the caller's transaction.
 */

import type { GrillQuestion, GrillQuestionDraft, StorageTx } from '@forge/core';
import { addDirectorSpend } from '#/tick/card-budget.js';
import type { PlanCtx } from '#/types/card-planning.types.js';

/** The model's draft as the card shows it: the question and its options numbered. */
export function toQuestion(
  draft: GrillQuestionDraft,
  n: number,
  open: number,
): GrillQuestion {
  return {
    question_id: `q${n}`,
    text: draft.text,
    ...(draft.why === undefined ? {} : { why: draft.why }),
    options: draft.options.map((o, i) => ({ id: `o${i + 1}`, ...o })),
    allow_other: true,
    open_points: open,
  };
}

/** Counts the question turn's cost on the card (ledger row and cached total) and checks its thresholds. */
export const spendOnQuestion = (
  tx: StorageTx,
  pc: PlanCtx,
  cost: number,
  at: string,
): Promise<void> =>
  addDirectorSpend(tx, pc.card.id, cost, at, pc.director.budget_warning_usd, {
    kind: 'grill',
  });
