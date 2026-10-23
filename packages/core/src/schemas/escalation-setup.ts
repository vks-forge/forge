/**
 * Setup causes — what the owner must fix outside a ticket before its Worker can run.
 *
 * Why: some waits are not about the ticket's work but about the machine around it: the
 *   harness is signed out, a tool the Worker needs is not approved, a new harness build has not
 *   been checked, or Forge could not get the worktree ready (an install step failed on the
 *   project's own base content, d-0180). Each needs a different fix in a different screen, so
 *   each is a typed cause that carries what the owner needs to see (the failed step and its
 *   output tail, the denial that named the tool) and what Forge compares later to know the cause
 *   is gone. The escalation payload that wraps it lives in `schemas/escalation`.
 *
 * Exports: SetupCause.
 * Depends on: schemas/harness, schemas/worktree-prep, zod. No IO.
 */

import { z } from 'zod';
import { HarnessId, HarnessKind } from '#/schemas/harness.js';
import { MAX_PREP_TAIL } from '#/schemas/worktree-prep.js';

/** What the owner must fix outside the ticket; `reason_code` is the `admit()` denial that named the tool. */
export const SetupCause = z.discriminatedUnion('type', [
  z.object({ type: z.literal('login'), harness_id: HarnessId }),
  z.object({
    type: z.literal('tool'),
    tool: z.string().min(1),
    harness_kind: HarnessKind,
    version: z.string().min(1),
    reason_code: z.string().min(1),
  }),
  z.object({
    type: z.literal('harness_build'),
    harness_kind: HarnessKind,
    version: z.string().min(1),
  }),
  /** A worktree setup step failed on base content; `settings_version` is the settings version the owner has to move past to fix it. */
  z.object({
    type: z.literal('worktree_setup'),
    step: z.string().min(1),
    command: z.string().min(1),
    exit_code: z.number().int().nullable(),
    timed_out: z.boolean(),
    tail: z.string().max(MAX_PREP_TAIL),
    settings_version: z.number().int().nonnegative(),
  }),
]);
export type SetupCause = z.infer<typeof SetupCause>;
