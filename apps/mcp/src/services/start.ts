/**
 * Startup of the `forge-mcp` process: env in, stdio server out, non-zero exit on refusal.
 *
 * Why: if the token does not match the run, or the environment is incomplete, the
 *   process must die loudly before it serves a single tool, so the driver sees a failed
 *   MCP server instead of a Worker quietly talking to the wrong run. This is the one
 *   place that reads environment variables and opens the database (code.md rule 1).
 *
 * Exports: parseEnv(), depsFromEnv(), start().
 * Depends on: @forge/core, @forge/db, @forge/mcp, node:path, schemas/env,
 *   services/sqlite-token-store, types/start.types. IO: opens SQLite, stdio via StartIo.
 */

import { delimiter } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { createStorageOnDriver, openSqliteDriver } from '@forge/db';
import { createForgeMcpServer, createRunTokenAuthority } from '@forge/mcp';
import type { ForgeMcpDeps } from '@forge/mcp';
import { ForgeEnv } from '#/schemas/env.js';
import { createSqliteTokenStore } from '#/services/sqlite-token-store.js';
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

/** Opens the SQLite database and assembles the server's dependencies. */
export function depsFromEnv(env: Env): ForgeMcpDeps {
  const e = parseEnv(env);
  // The driver already migrated the database; this process must not alter its schema.
  const driver = openSqliteDriver(e.FORGE_DB_PATH);
  return {
    storage: createStorageOnDriver(driver),
    runId: e.FORGE_RUN_ID,
    runToken: e.FORGE_RUN_TOKEN,
    tokens: createRunTokenAuthority(createSqliteTokenStore(driver)),
    ...(e.FORGE_SEARXNG_URL
      ? {
          searxng: {
            baseUrl: e.FORGE_SEARXNG_URL,
            allowHosts: list(e.FORGE_SEARXNG_ALLOW_HOSTS, ','),
          },
        }
      : {}),
    docsDirs: list(e.FORGE_DOCS_DIRS, delimiter),
    fetchAllowHosts: list(e.FORGE_FETCH_ALLOW_HOSTS, ','),
  };
}

/** Starts the server from `env`; on any startup failure writes to stderr and exits 1. */
export async function start(env: Env, io: StartIo): Promise<void> {
  try {
    await io.serve(await createForgeMcpServer(depsFromEnv(env)));
  } catch (err) {
    io.stderr(`forge-mcp: ${err instanceof Error ? err.message : 'startup failed'}\n`);
    io.exit(1);
  }
}
