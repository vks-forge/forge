/**
 * Turns the process environment and the `.forge/` yaml files into `ServerSettings`.
 *
 * Why: this is the single place that reads `process.env` for the server (code.md rule 1).
 *   It validates the environment, then loads and validates `forge.yaml` (model matrix and
 *   engine limits) and the project config, so a bad port, a bad model name or a missing
 *   project file stops the process before it opens a database or spawns anything.
 *
 * Exports: readServerEnv(), loadSettings().
 * Depends on: @forge/core (ForgeConfig, ProjectConfig, InvalidInputError), @forge/tools
 *   (DEV_CATALOGUE_KEY, devKeyAllowed), config/paths, config/load-yaml, schemas/env.
 *   IO: reads two yaml files.
 */

import { ForgeConfig, InvalidInputError, ProjectConfig } from '@forge/core';
import { DEV_CATALOGUE_KEY, devKeyAllowed } from '@forge/tools';
import { loadYaml } from '#/config/load-yaml.js';
import { resolveLayout } from '#/config/paths.js';
import { ServerEnv } from '#/schemas/env.js';
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

/** Loads everything the server needs to start; `cwd` is the root when `FORGE_ROOT` is unset. */
export async function loadSettings(
  rawEnv: Readonly<Record<string, string | undefined>>,
  cwd: string,
): Promise<ServerSettings> {
  const env = readServerEnv(rawEnv);
  const layout = resolveLayout(env.FORGE_ROOT ?? cwd, env.FORGE_PROJECT_CONFIG);
  const [forge, project] = await Promise.all([
    loadYaml(layout.forgeConfigPath, ForgeConfig, 'forge config'),
    loadYaml(layout.projectConfigPath, ProjectConfig, 'project config'),
  ]);

  return {
    layout,
    host: env.FORGE_HOST,
    port: env.FORGE_PORT,
    forge,
    project,
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
