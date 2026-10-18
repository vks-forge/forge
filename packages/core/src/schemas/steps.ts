/**
 * Director step schemas — names, request payload and the zod output of each LLM step.
 *
 * Why: the Director is a deterministic scheduler that calls the model in finite steps
 *   (triage, dispatch_prompt, steer_reply, card_chat and the card planning steps), and what comes back is untrusted text from a
 *   third-party harness. Each step's output is parsed against one of these schemas before
 *   the engine acts, so an out-of-range confidence or an empty prompt becomes a rejected
 *   step (retried once, then logged) and never a partial ticket write. The same schemas
 *   are turned into JSON Schema for the harness (`--json-schema`), so the model is told the
 *   exact shape it will be held to (director-core.md §5, d-0032). `NewRequestPayload` is
 *   the shape of a chat `new_request` intake payload, the only trigger in v1 (d-0002).
 *
 * Exports: STEP_NAMES, StepName, NewRequestPayload, TriageOutput, DispatchPromptOutput,
 *   SteerReplyOutput, ReplyPayload.
 * Depends on: schemas/card, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { CardTypeName } from '#/schemas/card.js';
import { Lane, Tier, TicketType } from '#/schemas/ticket.js';

/** The Director steps: the ticket steps of M0 and the card planning steps (their outputs are in schemas/director-steps). */
export const STEP_NAMES = [
  'triage',
  'dispatch_prompt',
  'steer_reply',
  'card_chat',
  'card_survey',
  'grill_turn',
  'verify',
  'enhance',
  'write_plan',
  'approve_plan',
  'custom_step',
  'ticket_answer',
  'ticket_recover',
  'draft_agent',
  'ticket_check',
] as const;
export const StepName = z.enum(STEP_NAMES);
export type StepName = z.infer<typeof StepName>;

/** What a chat `new_request` carries. `hint` is the user's explicit "quick" / "full" override (director-core.md §6). */
export const NewRequestPayload = z.object({
  text: z.string().min(1),
  title: z.string().min(1).optional(),
  type: TicketType.optional(),
  /** The card type to file this request under (d-0106); absent means `issue`. A name the registry does not know is refused. */
  card_type: CardTypeName.optional(),
  hint: z.enum(['quick', 'full']).optional(),
});
export type NewRequestPayload = z.infer<typeof NewRequestPayload>;

/** What a chat `reply` carries: the ticket it answers and the text. */
export const ReplyPayload = z.object({
  ticket_id: z.string().min(1),
  text: z.string().min(1),
});
export type ReplyPayload = z.infer<typeof ReplyPayload>;

/** `triage` output: director-core.md §5 plus the type, tier and title a ticket row needs. */
export const TriageOutput = z.object({
  lane: Lane,
  confidence: z.number().min(0).max(1),
  predicted_files: z.array(z.string()),
  questions: z.array(z.string()),
  type: TicketType,
  tier_predicted: Tier,
  title: z.string().min(1).max(120),
});
export type TriageOutput = z.infer<typeof TriageOutput>;

/** `dispatch_prompt` output: the Worker's rendered prompt (tool exposure is derived by the app from the catalogue, not by the model). */
export const DispatchPromptOutput = z.object({ prompt: z.string().min(1) });
export type DispatchPromptOutput = z.infer<typeof DispatchPromptOutput>;

/** `steer_reply` output; `none` means the message needs no delivery to the run. */
export const SteerReplyOutput = z.object({
  mode: z.enum(['steer', 'follow_up', 'interrupt', 'none']),
  text: z.string(),
});
export type SteerReplyOutput = z.infer<typeof SteerReplyOutput>;
