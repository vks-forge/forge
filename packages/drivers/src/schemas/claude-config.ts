/**
 * Claude driver config schema — engine choice and the timing knobs of one driver.
 *
 * Why: the Claude driver runs a Worker through one of two engines (the ACP adapter, or the
 *   `claude -p` CLI as fallback) and enforces a handful of time windows around it: how long
 *   to wait for a login report, how long a tool call may stay without a server-side
 *   receipt, how long a cancel may take before the process tree is killed. Those are
 *   operating values the operator tunes per host, not code, so they live in the yaml the
 *   app loads and are validated here once; a typo fails at start-up instead of as a stall
 *   in the middle of a run. The pinned adapter version sits here too, so a bump is a config
 *   change that `preflight()` checks against the bundled adapter. There is no CLI pin: the
 *   Worker runs the user's installed `claude`, whose version is reported and checked per
 *   install elsewhere (d-0087, d-0088).
 *
 * Exports: PINNED_ADAPTER_VERSION, ClaudeDriverConfig, parseClaudeConfig().
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** `@agentclientprotocol/claude-agent-acp` version the driver was measured against. */
export const PINNED_ADAPTER_VERSION = '0.89.1';

const ms = (fallback: number) => z.number().int().positive().default(fallback);

export const ClaudeDriverConfig = z.object({
  /** Which engine runs Workers: ACP adapter (default) or the `claude -p` CLI fallback. */
  engine: z.enum(['acp', 'cli']).default('acp'),
  /** A tool call with no server-side decision receipt after this long kills the run. */
  receiptGraceMs: ms(3_000),
  /** Turn the receipt cross-check off only if live probing shows PreToolUse does not fire for a tool class. */
  receiptCrossCheck: z.boolean().default(true),
  /** Time to wait for the adapter's `_auth/status_update` account report. */
  authTimeoutMs: ms(30_000),
  /** Time between a graceful cancel and killing the process tree. */
  cancelGraceMs: ms(5_000),
  /** Wait before a retry when a rate limit gives no reset time. */
  rateLimitBackoffMs: ms(60_000),
  /** Executable name or path used when the harness registry gives no override; resolved on PATH. */
  claudeBinary: z.string().min(1).default('claude'),
  /** Declare live `steer` for the ACP engine (the pinned adapter advertises `_session/steering`). */
  acpSteering: z.boolean().default(true),
  /**
   * Host variables handed to the harness on top of the built-in allowlist. Default none:
   * subscription login needs only the profile directory. Credential variables
   * (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`) are never passed through, even if named:
   * they come only from the harness's auth mode and its stored secret (d-0087).
   */
  envPassthrough: z.array(z.string().min(1)).default([]),
  pinnedAdapterVersion: z.string().min(1).default(PINNED_ADAPTER_VERSION),
});
export type ClaudeDriverConfig = z.infer<typeof ClaudeDriverConfig>;

/** Fills defaults and rejects unknown value types; missing config means all defaults. */
export function parseClaudeConfig(input: unknown): ClaudeDriverConfig {
  return ClaudeDriverConfig.parse(input ?? {});
}
