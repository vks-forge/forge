/**
 * Hook wire schemas — the request a harness hook posts and the answer it gets back.
 *
 * Why: a Worker's harness runs a tiny hook command on every tool event and obeys its exit
 *   code; the Forge server holds the policy, the run secret and the receipt chain. The two
 *   halves only meet through this JSON, so both sit on one definition: the harness-driver
 *   side (which turns the harness's stdin into a request) and the receipt ingress (which
 *   admits and signs). The payload names only what policy reads (`tool_name`,
 *   `tool_input`, `tool_use_id`) and keeps unknown fields, so a harness upgrade that adds
 *   or renames a field fails closed here instead of reaching `admit()` as an unchecked
 *   blob. A closed decision set plus a reason and the receipt hash lets the hook turn any
 *   answer into an exit code without interpreting policy, and a malformed answer is
 *   rejected so it can never be mistaken for `allow` (tool-system.md §10, d-0033, d-0056).
 *   The module imports zod only, so the hook process can load it without the policy ring.
 *
 * Exports: HOOK_EVENTS, HookEventName, SessionStartPayload, PreToolUsePayload,
 *   PostToolUsePayload, PostToolUseFailurePayload, HookPayload, HookRequest, HookVerdict,
 *   HookResponse.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const HOOK_EVENTS = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
] as const;
export const HookEventName = z.enum(HOOK_EVENTS);
export type HookEventName = z.infer<typeof HookEventName>;

const base = {
  session_id: z.string().optional(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
};

const toolBase = {
  ...base,
  /** Harness-native name: `Bash` (ACP), `PowerShell` (CLI on Windows), `mcp__<server>__<tool>`. */
  tool_name: z.string().min(1),
  tool_input: z.record(z.string(), z.unknown()).default({}),
  tool_use_id: z.string().min(1).optional(),
};

export const SessionStartPayload = z
  .object({
    hook_event_name: z.literal('SessionStart'),
    ...base,
    source: z.string().optional(),
  })
  .passthrough();
export type SessionStartPayload = z.infer<typeof SessionStartPayload>;

export const PreToolUsePayload = z
  .object({ hook_event_name: z.literal('PreToolUse'), ...toolBase })
  .passthrough();
export type PreToolUsePayload = z.infer<typeof PreToolUsePayload>;

export const PostToolUsePayload = z
  .object({
    hook_event_name: z.literal('PostToolUse'),
    ...toolBase,
    tool_response: z.unknown().optional(),
  })
  .passthrough();
export type PostToolUsePayload = z.infer<typeof PostToolUsePayload>;

export const PostToolUseFailurePayload = z
  .object({
    hook_event_name: z.literal('PostToolUseFailure'),
    ...toolBase,
    error: z.unknown().optional(),
  })
  .passthrough();
export type PostToolUseFailurePayload = z.infer<typeof PostToolUseFailurePayload>;

export const HookPayload = z.discriminatedUnion('hook_event_name', [
  SessionStartPayload,
  PreToolUsePayload,
  PostToolUsePayload,
  PostToolUseFailurePayload,
]);
export type HookPayload = z.infer<typeof HookPayload>;

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
