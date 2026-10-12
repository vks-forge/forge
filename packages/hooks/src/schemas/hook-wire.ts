/**
 * Hook-to-server wire schemas — the request the hook posts and the answer it gets back.
 *
 * Why: the hook script runs inside the Worker's harness and must stay tiny and dumb; the
 *   Forge server holds the policy, the run secret and the receipt chain. The two halves
 *   only meet through this JSON. A closed decision set plus a reason and the receipt hash
 *   lets the hook turn any answer into an exit code without interpreting policy, and a
 *   malformed answer is rejected here so it can never be mistaken for `allow`
 *   (tool-system.md §10, d-0033).
 *
 * Exports: HookRequest, HookResponse, HookVerdict.
 * Depends on: schemas/hook-payload, zod. No IO.
 */

import { z } from 'zod';
import {
  PostToolUseFailurePayload,
  PostToolUsePayload,
  PreToolUsePayload,
  SessionStartPayload,
} from '#/schemas/hook-payload.js';

const seq = z.number().int().nonnegative();

/**
 * `seq` is the client's own wall-clock ordering hint (ms since epoch); the hook is a
 * fresh process per event and has no counter. The server's chain `seq` is authoritative.
 */
export const HookRequest = z.discriminatedUnion('event', [
  z.object({ event: z.literal('SessionStart'), payload: SessionStartPayload, seq }),
  z.object({ event: z.literal('PreToolUse'), payload: PreToolUsePayload, seq }),
  z.object({ event: z.literal('PostToolUse'), payload: PostToolUsePayload, seq }),
  z.object({
    event: z.literal('PostToolUseFailure'),
    payload: PostToolUseFailurePayload,
    seq,
  }),
]);
export type HookRequest = z.infer<typeof HookRequest>;

export const HookVerdict = z.enum(['allow', 'deny', 'ask']);
export type HookVerdict = z.infer<typeof HookVerdict>;

/** `receipt_hash` is the HMAC of the receipt written for this event, or '' when none was. */
export const HookResponse = z.object({
  decision: HookVerdict,
  reason: z.string(),
  receipt_hash: z.string(),
});
export type HookResponse = z.infer<typeof HookResponse>;
