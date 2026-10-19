/**
 * Finds the data home on this machine and lays out the folders under it.
 *
 * Why: the database, secrets, runs and Worker worktrees all live in one per-user folder
 *   outside every repository (d-0098), always the platform default (d-0170). The rule that
 *   picks the folder is pure and lives in `@forge/core` so the CLI agrees with the server;
 *   this file only feeds it the real platform and home directory. `FORGE_HOME` (development
 *   and tests only) replaces the default.
 *
 * Exports: loadDataHome(), nodeDataHomeIo.
 * Depends on: node:os, @forge/core (resolveDataHome, dataHomeLayout), types/data-home. No file IO.
 */

import { homedir } from 'node:os';
import { dataHomeLayout, resolveDataHome } from '@forge/core';
import type { DataHomeLayout } from '@forge/core';
import type { DataHomeIo } from '#/types/data-home.types.js';

/** The real machine. */
export const nodeDataHomeIo: DataHomeIo = {
  platform: process.platform,
  homedir: homedir(),
};

/** Resolves the data home from the environment; throws InvalidInputError on a relative `FORGE_HOME`. */
export function loadDataHome(
  env: Readonly<Record<string, string | undefined>>,
  io: DataHomeIo = nodeDataHomeIo,
): DataHomeLayout {
  const base = { platform: io.platform, env, homedir: io.homedir };

  return dataHomeLayout(resolveDataHome(base), io.platform);
}
