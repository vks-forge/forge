/**
 * Environment contract between the driver and the `forge-mcp` process.
 *
 * Why: a driver can only hand a server process environment variables. Declaring them as
 *   one schema makes the launch contract explicit and means an incomplete environment
 *   stops the process before it serves anything, instead of failing mid-run.
 *
 * `FORGE_SEARXNG_URL`, `FORGE_SEARXNG_ALLOW_HOSTS` and `FORGE_FETCH_ALLOW_HOSTS` are a dev override of the
 *   research settings stored in the database (code.md rule 9); a normal run sets none of them.
 *
 * Exports: ForgeEnv.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const ForgeEnv = z.object({
  FORGE_RUN_ID: z.string().min(1),
  FORGE_RUN_TOKEN: z.string().min(1),
  FORGE_DB_PATH: z.string().min(1),
  FORGE_SEARXNG_URL: z.string().optional(),
  FORGE_SEARXNG_ALLOW_HOSTS: z.string().optional(),
  FORGE_DOCS_DIRS: z.string().optional(),
  FORGE_FETCH_ALLOW_HOSTS: z.string().optional(),
});
export type ForgeEnv = z.infer<typeof ForgeEnv>;
