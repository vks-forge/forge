/**
 * Escalation payload for a tool call waiting on the owner's approval.
 *
 * Why: on Standard and Full a Worker's call that policy marks `ask` (an install, an edit under
 *   `migrations/`) does not run; the owner sees the exact command, why the Worker wants it and
 *   what rule asked, and answers allow once, always for this project, or deny. This payload is
 *   what the Needs-you item, the Inbox and the resumed Worker all read. `what` is the tokenised
 *   call itself, never the Worker's prose; `why` is the Worker's own words, shown as untrusted
 *   text. `always` says up front whether "Always" is offered and which rule it would store
 *   (d-0175, tool-system.md §5.4).
 *
 * Exports: EscalationPermission, PERMISSION_WHAT_MAX, PERMISSION_WHY_MAX.
 * Depends on: schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { Lane } from '#/schemas/ticket.js';

/** The exact command, URL or path is shown in full up to this many characters. */
export const PERMISSION_WHAT_MAX = 2000;
/** The Worker's own reason is clipped to this many characters. */
export const PERMISSION_WHY_MAX = 300;

export const EscalationPermission = z.object({
  kind: z.literal('permission'),
  tool: z.string().min(1),
  action: z.string().min(1),
  /** The exact command, URL or path, built from the tokenised call, never from Worker text. */
  what: z.string().min(1).max(PERMISSION_WHAT_MAX),
  /** `approvalKey()` of the call; the answer rides on this key for the asking run and its resume. */
  approval_key: z.string().min(1),
  /** The `admit()` reason that asked (`rule_ask`, `no_matching_rule`, ...). */
  reason_code: z.string().min(1),
  /** The Worker's own words (untrusted). */
  why: z.string().min(1).max(PERMISSION_WHY_MAX).optional(),
  lane: Lane,
  /** Whether "Always for this project" is offered, with the rule it would store or why not. */
  always: z.object({
    offered: z.boolean(),
    rule: z.object({ action: z.string().min(1), resource: z.string().min(1) }).optional(),
    why: z.string().min(1).optional(),
  }),
  summary: z.string().min(1),
});
export type EscalationPermission = z.infer<typeof EscalationPermission>;
