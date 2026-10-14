/**
 * Where the server's files live, derived from the repository root.
 *
 * Why: runtime data, the database, per-run directories and secrets all sit under one
 *   gitignored `.forge/data/` in the main checkout, outside every Worker worktree, so the
 *   outside-cwd floors keep Workers away from them (d-0028, d-0059). Computing the layout
 *   in one place means the database path handed to the per-run MCP process, the report
 *   store and the secret store can never disagree.
 *
 * Exports: resolveLayout(), MCP_ENTRY.
 * Depends on: node:path, node:url. No IO.
 */

import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Layout } from '#/types/settings.types.js';

/** Built entry of the per-run MCP server; `apps/mcp` must be built (`pnpm build`) before a live run. */
export const MCP_ENTRY = fileURLToPath(
  new URL('../../../mcp/dist/main.js', import.meta.url),
);

/** All paths under `root`; `projectConfigPath` overrides the default `.forge/project.yaml`. */
export function resolveLayout(root: string, projectConfigPath?: string): Layout {
  const base = resolve(root);
  const forgeDir = join(base, '.forge');
  const dataDir = join(forgeDir, 'data');

  return {
    root: base,
    forgeDir,
    dataDir,
    dbPath: join(dataDir, 'forge.db'),
    runsDir: join(dataDir, 'runs'),
    secretsDir: join(dataDir, 'secrets'),
    memoryDir: join(forgeDir, 'memory'),
    cataloguePath: join(forgeDir, 'tools', 'catalog.yaml'),
    forgeConfigPath: join(forgeDir, 'config', 'forge.yaml'),
    projectConfigPath: projectConfigPath
      ? resolve(base, projectConfigPath)
      : join(forgeDir, 'project.yaml'),
    mcpEntry: MCP_ENTRY,
  };
}
