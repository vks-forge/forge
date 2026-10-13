/**
 * Per-run hook config file schema — `.forge/data/runs/<id>/hook.json`.
 *
 * Why: each Worker run needs its own server address, bearer token and timeout, and the
 *   hook process has no other channel to learn them (the harness gives it nothing but
 *   stdin). The driver writes this file when it starts the run; the hook reads it on
 *   every event. It deliberately holds no run secret: a Worker that can read the file
 *   can post events as itself but cannot forge receipts (verification-plane.md §2).
 *
 * Exports: HookConfig, HOOK_CONFIG_ENV.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Env var the driver sets in the harness environment to point at the config file. */
export const HOOK_CONFIG_ENV = 'FORGE_HOOK_CONFIG';

export const HookConfig = z.object({
  run_id: z.string().min(1),
  server_url: z.url(),
  token: z.string().min(1),
  timeout_ms: z.number().int().positive(),
});
export type HookConfig = z.infer<typeof HookConfig>;
