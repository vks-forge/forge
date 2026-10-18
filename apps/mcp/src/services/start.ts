/**
 * Startup of the `forge-mcp` process: env in, stdio server out, non-zero exit on refusal.
 *
 * Why: if the token does not match the run, or the environment is incomplete, the
 *   process must die loudly before it serves a single tool, so the driver sees a failed
 *   MCP server instead of a Worker quietly talking to the wrong run. This is the one
 *   place that reads environment variables and opens the database (code.md rule 1). It also gives the memory tools
 *   their index and the scope builder, so a Worker reads project memory read-only and only inside its agent's slice.
 *
 * Exports: parseEnv(), depsFromEnv(), start().
 * Depends on: @forge/core, @forge/mcp, @forge/memory, node:path, schemas/env, services/memory-scope, services/open-database, services/research-settings,
 *   types/start.types. IO: opens SQLite (existing, never migrated), stdio via StartIo.
 */

import { delimiter } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { createForgeMcpServer } from '@forge/mcp';
import { createSqlMemoryIndex } from '@forge/memory';
import type { ForgeMcpDeps } from '@forge/mcp';
import { ForgeEnv } from '#/schemas/env.js';
import { memoryScopeResolver } from '#/services/memory-scope.js';
import { openExistingDatabase } from '#/services/open-database.js';
import { resolveResearch } from '#/services/research-settings.js';
import type { Env, StartIo } from '#/types/start.types.js';

const list = (s: string | undefined, sep: string): string[] =>
  (s ?? '')
    .split(sep)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

/** Validates the environment; throws InvalidInputError naming the missing variables. */
export function parseEnv(env: Env): ForgeEnv {
  const parsed = ForgeEnv.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new InvalidInputError(`missing or invalid environment: ${names}`);
  }

  return parsed.data;
}

/**
 * Opens the existing SQLite database (never creating or migrating it), builds the research
 * provider from the settings stored in it, and assembles the server's dependencies.
 */
export async function depsFromEnv(env: Env): Promise<ForgeMcpDeps> {
  const e = parseEnv(env);
  const { storage, config } = openExistingDatabase(e.FORGE_DB_PATH);

  return {
    storage,
    runId: e.FORGE_RUN_ID,
    runToken: e.FORGE_RUN_TOKEN,
    ...(await resolveResearch(storage, config, e.FORGE_RUN_ID, {
      searxngUrl: e.FORGE_SEARXNG_URL,
      searxngAllowHosts: list(e.FORGE_SEARXNG_ALLOW_HOSTS, ','),
      fetchAllowHosts: list(e.FORGE_FETCH_ALLOW_HOSTS, ','),
    })),
    docsDirs: list(e.FORGE_DOCS_DIRS, delimiter),
    // Project memory is read through the index; the scope comes from the run's agent, never from a tool input.
    memory: createSqlMemoryIndex({ storage, now: () => new Date() }),
    memoryScope: memoryScopeResolver(storage, config),
  };
}

/**
 * Starts the server from `env`; on any startup failure writes to stderr and exits 1.
 * `makeDeps` is the seam a test uses to keep hold of the database it opened and close it.
 */
export async function start(
  env: Env,
  io: StartIo,
  makeDeps: (env: Env) => Promise<ForgeMcpDeps> = depsFromEnv,
): Promise<void> {
  try {
    await io.serve(await createForgeMcpServer(await makeDeps(env)));
  } catch (err) {
    io.stderr(`forge-mcp: ${err instanceof Error ? err.message : 'startup failed'}\n`);
    io.exit(1);
  }
}
