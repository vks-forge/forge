/**
 * Turns the process environment, the data home and the yaml config files into `ServerSettings`.
 *
 * Why: this is the single place that reads `process.env` for the server (code.md rule 1).
 *   It validates the environment and resolves where the data home and the config files are,
 *   so a bad port stops the process before it opens a database or spawns anything. Engine
 *   limits and project settings are not read here: they live in the database (d-0085) and
 *   the engine reads them each tick.
 *
 * Exports: readServerEnv(), loadSettings().
 * Depends on: @forge/core (InvalidInputError), @forge/tools (DEV_CATALOGUE_KEY,
 *   devKeyAllowed), config/{paths,data-home,entrypoints}, schemas/env.
 *   IO: through config/data-home, the bootstrap file.
 */

import { InvalidInputError } from '@forge/core';
import { DEV_CATALOGUE_KEY, devKeyAllowed } from '@forge/tools';
import { loadDataHome } from '#/config/data-home.js';
import { resolveEntrypoints } from '#/config/entrypoints.js';
import { resolveLayout } from '#/config/paths.js';
import { ServerEnv } from '#/schemas/env.js';
import type { DataHomeIo } from '#/types/data-home.types.js';
import type { HttpTuning, ServerSettings } from '#/types/settings.types.js';

const DEFAULT_HTTP: HttpTuning = { ssePollMs: 500, sseHeartbeatMs: 15_000 };

/** Validates the raw environment; throws InvalidInputError listing the bad variables. */
export function readServerEnv(
  raw: Readonly<Record<string, string | undefined>>,
): ServerEnv {
  const parsed = ServerEnv.safeParse(raw);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');

    throw new InvalidInputError(`invalid server environment: ${names}`);
  }

  return parsed.data;
}

/**
 * Loads everything the server needs to start; `cwd` is the config root when `FORGE_ROOT` is
 * unset. `dataHomeIo` is the machine the data home is looked up on (the real one by default).
 */
export async function loadSettings(
  rawEnv: Readonly<Record<string, string | undefined>>,
  cwd: string,
  dataHomeIo?: DataHomeIo,
): Promise<ServerSettings> {
  const env = readServerEnv(rawEnv);
  const layout = resolveLayout(
    env.FORGE_ROOT ?? cwd,
    await loadDataHome(rawEnv, dataHomeIo),
    resolveEntrypoints(import.meta.url),
    env.FORGE_PROJECT_CONFIG,
  );

  return {
    layout,
    host: env.FORGE_HOST,
    port: env.FORGE_PORT,
    env: rawEnv,
    catalogueKey: env.FORGE_CATALOGUE_KEY ?? DEV_CATALOGUE_KEY,
    allowDevCatalogueKey: devKeyAllowed(rawEnv),
    ...(env.FORGE_CLAUDE_BINARY ? { claudeBinary: env.FORGE_CLAUDE_BINARY } : {}),
    harnessEnvPassthrough: env.FORGE_HARNESS_ENV_PASSTHROUGH,
    engine: env.FORGE_ENGINE,
    shutdownGraceMs: env.FORGE_SHUTDOWN_GRACE_MS,
    http: DEFAULT_HTTP,
  };
}
