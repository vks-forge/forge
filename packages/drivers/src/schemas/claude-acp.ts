/**
 * Schemas for the ACP adapter's non-standard payloads that the driver reads.
 *
 * Why: the ACP adapter reports things the protocol has no first-class field for: the
 *   login account (`_auth/status_update`), the rate-limit state (`_meta["_claude/rateLimit"]`
 *   on usage updates), the failure category on a rejected prompt (`data.errorKind`) and
 *   whether steering is available (`initialize` `_meta.steering`). All of it arrives from a
 *   third-party process whose shapes change between versions, and a wrong guess would turn
 *   a rate limit into a crash or a logged-out host into a stall. Each reader here is
 *   lenient (unknown fields kept, missing fields optional) and returns "unknown" instead of
 *   throwing, so a format change degrades to `unknown` and never takes the driver down.
 *
 * Exports: AuthStatusUpdate, RateLimitInfo, readRateLimit(), readErrorKind(), readSteering(),
 *   readClaudeToolName().
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** `{authStatus: {kind}}` pushed by the adapter; `kind: "account"` is a subscription login. */
export const AuthStatusUpdate = z.object({
  authStatus: z.object({ kind: z.string() }).passthrough(),
});
export type AuthStatusUpdate = z.infer<typeof AuthStatusUpdate>;

/** `rate_limit_info` of the Claude SDK; `resetsAt` is epoch seconds. */
export const RateLimitInfo = z
  .object({
    status: z.string().optional(),
    resetsAt: z.number().optional(),
    rateLimitType: z.string().optional(),
  })
  .passthrough();
export type RateLimitInfo = z.infer<typeof RateLimitInfo>;

const Meta = z.record(z.string(), z.unknown());

/** Rate-limit info from a usage update's `_meta`, or null when absent or unreadable. */
export function readRateLimit(meta: unknown): RateLimitInfo | null {
  const m = Meta.safeParse(meta);
  if (!m.success) {
    return null;
  }

  const info = RateLimitInfo.safeParse(m.data['_claude/rateLimit']);

  return info.success ? info.data : null;
}

/** `data.errorKind` of a JSON-RPC error, or undefined. */
export function readErrorKind(data: unknown): string | undefined {
  const d = z.object({ errorKind: z.string() }).safeParse(data);

  return d.success ? d.data.errorKind : undefined;
}

/** True when `initialize` `_meta.steering.supported` is exactly `true`. */
export function readSteering(meta: unknown): boolean {
  const m = z.object({ steering: z.object({ supported: z.boolean() }) }).safeParse(meta);

  return m.success && m.data.steering.supported;
}

/** Native tool name from a tool call's `_meta.claudeCode.toolName`, when the adapter adds it. */
export function readClaudeToolName(meta: unknown): string | undefined {
  const m = z
    .object({ claudeCode: z.object({ toolName: z.string().min(1) }) })
    .safeParse(meta);

  return m.success ? m.data.claudeCode.toolName : undefined;
}
