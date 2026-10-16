/**
 * Migration 0020: a project can be scoped to a subfolder of a repository.
 *
 * Why: any folder can be a project (d-0124). When the chosen folder sits inside a larger
 *   repository and the user picks "only this subfolder", Forge must still cut worktrees
 *   from the repository's top folder (git cannot do otherwise) while the Worker, the
 *   checks and the gates stay inside the subfolder. `repo_root` is that top folder and
 *   `subfolder` the project folder's path from it; both are null for the usual project
 *   whose `local_path` is itself the repository top, so existing rows are unchanged.
 *
 * Exports: MIGRATION_0020.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0020: Migration = {
  id: 20,
  name: 'project-scope',
  sql: `
ALTER TABLE projects ADD COLUMN repo_root TEXT;
ALTER TABLE projects ADD COLUMN subfolder TEXT;
`,
};
