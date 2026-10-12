/**
 * Hook stdin payload schemas — what the harness pipes to our hook script.
 *
 * Why: the harness (Claude Code CLI or the ACP adapter) runs our hook as a child process
 *   and describes the event as JSON on stdin. That JSON is the only evidence of what the
 *   Worker is about to do, and it comes from a third-party program whose fields change
 *   between versions. Parsing it at the boundary, keeping unknown fields, and naming the
 *   fields the policy reads (`tool_name`, `tool_input`, `tool_use_id`) means a harness
 *   upgrade that renames something fails closed in the hook instead of reaching
 *   `admit()` as an unchecked blob. Probes 2 and 5 confirmed `hook_event_name` and
 *   `tool_name` on stdin; the rest follow Claude Code's documented hook input.
 *
 * Exports: HOOK_EVENTS, HookEventName, SessionStartPayload, PreToolUsePayload,
 *   PostToolUsePayload, PostToolUseFailurePayload, HookPayload.
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
