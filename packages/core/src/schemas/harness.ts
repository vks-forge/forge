/**
 * Harness schema — the installed coding harnesses Forge may run Workers and the Director on.
 *
 * Why: Forge does not bundle a harness; it runs the one the user already installed and
 *   signed in to (d-0087). The owner must be able to say which executable that is, how the
 *   harness authenticates (its own login, an API key, or a long-lived OAuth token) and see
 *   whether the last check passed, without editing files. This is the database row behind
 *   that Settings page. `kind` names the driver family and is the only place a harness name
 *   appears in core data; the credential itself is never in the row, only in the SecretStore
 *   under `harness/<id>/api-key` or `harness/<id>/oauth-token`. `bypass_permissions` (default on)
 *   says whether Workers on it run without asking the owner (d-0183).
 *
 * Exports: HarnessId, HarnessKind, HarnessAuthMode, HarnessSecretKind, HarnessStatus, Harness.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Lowercase slug; it is also a segment of the harness's secret names, so it must stay path-safe. */
export const HarnessId = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);

/** The driver family that can run this harness. */
export const HarnessKind = z.enum(['claude']);
export type HarnessKind = z.infer<typeof HarnessKind>;

/** `login` uses the harness's own sign-in (default); the others read a secret per run (d-0087). */
export const HarnessAuthMode = z.enum(['login', 'api_key', 'oauth_token']);
export type HarnessAuthMode = z.infer<typeof HarnessAuthMode>;

/** The credential kinds a harness can hold in the SecretStore (`login` needs none). */
export const HarnessSecretKind = z.enum(['api_key', 'oauth_token']);
export type HarnessSecretKind = z.infer<typeof HarnessSecretKind>;

/**
 * Result of the last environment test; `unknown` until one ran. `paused` means the
 * compatibility check of the installed build failed: runs refuse to start until a later
 * check passes (d-0088).
 */
export const HarnessStatus = z.enum(['unknown', 'ok', 'error', 'paused']);
export type HarnessStatus = z.infer<typeof HarnessStatus>;

/** The `harnesses` table row. */
export const Harness = z.object({
  id: HarnessId,
  kind: HarnessKind,
  /** Absolute path of the executable; absent means "find it on PATH". */
  binary_path: z.string().min(1).optional(),
  /** Version reported by the last successful test. */
  version: z.string().min(1).optional(),
  auth_mode: HarnessAuthMode,
  status: HarnessStatus,
  last_checked_at: z.iso.datetime().optional(),
  /** Plain-language reason shown next to a `paused` status (what failed, what to do). */
  status_note: z.string().min(1).optional(),
  /**
   * "Bypass permissions" (d-0183): Workers on this harness start in its no-prompt mode and Forge allows
   * every `ask`, except the hard floor. Absent means on; `bypassOn()` is the only place that default lives.
   */
  bypass_permissions: z.boolean().optional(),
});
export type Harness = z.infer<typeof Harness>;
