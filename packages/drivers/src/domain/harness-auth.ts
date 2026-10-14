/**
 * How each harness auth mode turns into child environment and into an accepted login report.
 *
 * Why: the owner picks per harness whether Claude Code runs on its own login, an Anthropic
 *   API key or a long-lived OAuth token (d-0087). The mode decides two things that must not
 *   drift apart: which environment variable carries the secret into the child (and that no
 *   other credential variable rides along, or billing would silently go to the wrong
 *   account), and which account kind the ACP adapter must report before a Worker may start.
 *   Both live here as pure tables so they are tested without a process.
 *
 * Exports: AUTH_ENV_NAMES, authEnvFor(), authVerdict(), accountKindFromCliStatus(),
 *   expectedCliKind().
 * Depends on: @forge/core (HarnessAuthMode), zod, types/claude/harness. No IO.
 */

import type { HarnessAuthMode } from '@forge/core';
import { z } from 'zod';
import type { AuthVerdict } from '#/types/claude/harness.types.js';

/** Credential variables a harness child may only receive through its harness's auth mode. */
export const AUTH_ENV_NAMES = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'] as const;

/** The environment that carries `secret` for `mode`; empty for `login`. Never read from the server's own env. */
export function authEnvFor(
  mode: HarnessAuthMode,
  secret: string | null,
): Record<string, string> {
  if (mode === 'api_key' && secret !== null) {
    return { ANTHROPIC_API_KEY: secret };
  }

  if (mode === 'oauth_token' && secret !== null) {
    return { CLAUDE_CODE_OAUTH_TOKEN: secret };
  }

  return {};
}

/**
 * What an `_auth/status_update` kind means for `mode`. Measured on claude 2.1.299: with
 * `ANTHROPIC_API_KEY` the adapter reports `api_key`; a login reports `account`. An OAuth
 * token from `claude setup-token` carries no plan, so the adapter may report `none` or
 * `account`; that mode accepts any report (the token is checked by the first prompt, which
 * ends as `auth` when it is bad) and the caller records which kind arrived.
 */
export function authVerdict(mode: HarnessAuthMode, kind: string): AuthVerdict {
  if (mode === 'oauth_token') {
    return 'accept';
  }

  if (mode === 'api_key') {
    return kind === 'api_key' ? 'accept' : 'ignore';
  }

  if (kind === 'account') {
    return 'accept';
  }

  return kind === 'none' ? 'reject' : 'ignore';
}

const StatusJson = z.object({
  loggedIn: z.boolean().optional(),
  authMethod: z.string().optional(),
  apiKeySource: z.string().optional(),
});

/**
 * The credential `claude auth status --json` says is in use: `api_key`, `oauth_token`,
 * `account` (a login) or `none`; null when the output is not that JSON (an older CLI).
 * Measured on 2.1.299: `authMethod` is `claude.ai`, `api_key` or `oauth_token`, and an API
 * key from the environment also sets `apiKeySource`. This is the CLI's vocabulary, close
 * to but not the same as the ACP adapter's `_auth/status_update` kinds.
 */
export function accountKindFromCliStatus(stdout: string): string | null {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return null;
  }

  const parsed = StatusJson.safeParse(json);
  if (!parsed.success || parsed.data.loggedIn === undefined) {
    return null;
  }

  const { authMethod, apiKeySource, loggedIn } = parsed.data;
  if (apiKeySource || authMethod === 'api_key') {
    return 'api_key';
  }

  if (authMethod === 'oauth_token') {
    return 'oauth_token';
  }

  return loggedIn ? 'account' : 'none';
}

/** The `accountKindFromCliStatus` value a correctly configured harness shows for `mode`. */
export function expectedCliKind(mode: HarnessAuthMode): string {
  return mode === 'login' ? 'account' : mode;
}
