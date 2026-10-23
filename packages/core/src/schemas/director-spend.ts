/**
 * Director spend schema: one dated row per Director model step that cost money.
 *
 * Why: the Director (planning, chat, escalation answers, sign-off checks) spends real money that no
 *   Worker run records. It used to be one undated running total inside a card's planning state, so the
 *   Cost page, Overview and ticket pages (all built on runs) left it out and disagreed with the card,
 *   which added it. A row per step with the project, the card and ticket it belongs to when known, the
 *   step kind, the model and the day it happened lets every page add Worker and Director spend the same
 *   way, split by day, project and source. `recorded` is false when the step ran but the harness
 *   reported no price: the row still counts as a step, never as a guessed amount (`usd` is then 0).
 *
 * Exports: NewDirectorSpend, DirectorSpend, SPEND_SOURCES, SpendSource.
 * Depends on: schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { CardId, TicketId } from '#/schemas/ids.js';

/** Where a dollar was spent: a Worker run, or a Director model step. */
export const SPEND_SOURCES = ['worker', 'director'] as const;
export const SpendSource = z.enum(SPEND_SOURCES);
export type SpendSource = z.infer<typeof SpendSource>;

/**
 * A row to append. `card_id` is absent for a step on a ticket that belongs to no card; `kind` names the
 * step (a planning step kind, `card_chat`, `escalation_answer`, `stage_check`, `backfill`, ...).
 */
export const NewDirectorSpend = z.object({
  project: z.string().min(1),
  card_id: CardId.optional(),
  ticket_id: TicketId.optional(),
  kind: z.string().min(1),
  model: z.string().min(1).optional(),
  usd: z.number().nonnegative(),
  recorded: z.boolean(),
  at: z.iso.datetime(),
});
export type NewDirectorSpend = z.infer<typeof NewDirectorSpend>;

export const DirectorSpend = NewDirectorSpend.extend({ id: z.number().int().positive() });
export type DirectorSpend = z.infer<typeof DirectorSpend>;
