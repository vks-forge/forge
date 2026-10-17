/**
 * Ticket review facts: what the owner needs on screen to approve or sign off finished work.
 *
 * Why: a ticket in `review` or `needs_signoff` is waiting for a person to merge it, and merging
 *   is irreversible. Approving blind is not a decision, so the ticket read carries the size of
 *   the change (files, lines added and removed) and the commit the gates judged, next to the PR
 *   link and the G1 report the page already has. The facts are read from the ticket's worktree,
 *   so they are the diff the merge will land, not what the Worker claimed.
 *
 * Exports: TicketReview, TicketReviewFile.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const TicketReviewFile = z.object({
  status: z.enum(['A', 'M', 'D', 'R']),
  path: z.string().min(1),
});
export type TicketReviewFile = z.infer<typeof TicketReviewFile>;

/** The diff of finished work against its base, and the commit under review. */
export const TicketReview = z.object({
  files: z.array(TicketReviewFile),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  /** The commit the gates judged and a merge would land; absent when no gate row recorded one. */
  head_sha: z.string().min(1).optional(),
});
export type TicketReview = z.infer<typeof TicketReview>;
