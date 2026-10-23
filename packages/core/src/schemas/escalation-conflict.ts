/**
 * Merge-conflict detail of a failure escalation — the files that clash and who changed them first.
 *
 * Why: when the ticket's writer cannot combine its change with what merged first, the owner is asked
 *   what to do. To decide they need the plain facts, not a git message: which files clash and which
 *   tickets changed them first (a ticket id when the commit names one, else its subject). The same
 *   facts rebuild the writer's brief when the owner chooses Try again. Capped, because the payload is
 *   stored with the interaction and drawn on a card.
 *
 * Exports: EscalationConflict.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** The clash a `merge_conflict` failure carries: at most 50 files and 20 upstream changes. */
export const EscalationConflict = z.object({
  files: z.array(z.string()).max(50),
  upstream: z
    .array(
      z.object({
        ref: z.string().min(1),
        ticket_id: z.string().min(1).optional(),
        title: z.string().min(1),
      }),
    )
    .max(20),
});
export type EscalationConflict = z.infer<typeof EscalationConflict>;
