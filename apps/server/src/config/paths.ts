/**
 * Where the server's files live: config in the checkout, data in the data home.
 *
 * Why: Forge's own files (database, per-run directories, secrets, Worker worktrees) live in
 *   one per-user data home outside every repository and outside every Worker worktree, so the
 *   data-home floor can deny Workers the whole folder by absolute path (d-0098, d-0059). The
 *   yaml config is still read from the checkout until it moves into the database; it is kept
 *   in clearly separate fields so no caller can mix a config path with a data path. Computing
 *   the layout in one place means the database path handed to the per-run MCP process, the
 *   report store and the secret store can never disagree.
 *
 * Exports: resolveLayout().
 * Depends on: node:path, @forge/core (DataHomeLayout), types/entrypoints, types/settings. No IO.
 */

import { join, resolve } from 'node:path';
import type { DataHomeLayout } from '@forge/core';
import type { Entrypoints } from '#/types/entrypoints.types.js';
import type { Layout } from '#/types/settings.types.js';

/**
 * All paths for a server whose config is read from `configRoot` and whose data lives in
 * `data`. Projects keep their own clone paths in the database, not here.
 */
export function resolveLayout(
  configRoot: string,
  data: DataHomeLayout,
  entrypoints: Entrypoints,
): Layout {
  const base = resolve(configRoot);
  const forgeDir = join(base, '.forge');

  return {
    configRoot: base,
    memoryDir: join(forgeDir, 'memory'),
    data,
    mcpEntry: entrypoints.mcpEntry,
    hookJsPath: entrypoints.hookJsPath,
  };
}
