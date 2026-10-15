/**
 * SQLite ProjectRepository for the `projects` table.
 *
 * Why: the Director works on several repos and must know, from a ticket's project, where
 *   the repo lives (local clone, GitHub connection and repository), where its memory lives,
 *   which harness to default to, whether it is onboarding, ready or archived and which
 *   ecosystems it uses. The deprecated tier-C column is still written but nothing reads it. The registry is small and edited rarely, so it is plain upsert-by-id; the
 *   upsert is `ON CONFLICT (id) DO UPDATE` rather than replace, so the row keeps its place
 *   in the list, and the slug stays unique (two projects with one slug would make slug
 *   lookups ambiguous, and the violation surfaces as `invalid_input`). Rows are re-parsed
 *   with the core `Project` schema on read (director-core.md §3).
 *
 * Exports: createProjectRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { Project } from '@forge/core';
import type { ProjectRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

function toProject(row: SqlRow): Project {
  const { harness_defaults_json, tier_c_globs_json, ecosystems_json, ...rest } =
    dropNulls(row);

  return parseStored(
    Project,
    {
      ...rest,
      harness_defaults: fromJson(harness_defaults_json),
      tier_c_globs: fromJson(tier_c_globs_json),
      ecosystems: fromJson(ecosystems_json),
    },
    'project',
  );
}

export function createProjectRepository(driver: SqlDriver): ProjectRepository {
  return {
    async get(id) {
      const row = driver.get('SELECT * FROM projects WHERE id = ?', [id]);

      return row ? toProject(row) : null;
    },

    async upsert(project) {
      const p = Project.parse(project);
      driver.run(
        `INSERT INTO projects (id, slug, prefix, repo_origin, memory_repo, harness_defaults_json, tier_c_globs_json,
           local_path, connection_id, repo_full_name, status, ecosystems_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, prefix = excluded.prefix,
           repo_origin = excluded.repo_origin, memory_repo = excluded.memory_repo,
           harness_defaults_json = excluded.harness_defaults_json,
           tier_c_globs_json = excluded.tier_c_globs_json, local_path = excluded.local_path,
           connection_id = excluded.connection_id, repo_full_name = excluded.repo_full_name,
           status = excluded.status, ecosystems_json = excluded.ecosystems_json`,
        [
          p.id,
          p.slug,
          p.prefix,
          p.repo_origin ?? null,
          p.memory_repo ?? null,
          toJson(p.harness_defaults),
          toJson(p.tier_c_globs),
          p.local_path ?? null,
          p.connection_id ?? null,
          p.repo_full_name ?? null,
          p.status,
          toJson(p.ecosystems),
        ],
      );
    },

    async delete(id) {
      return driver.run('DELETE FROM projects WHERE id = ?', [id]).changes > 0;
    },

    async list() {
      return driver.all('SELECT * FROM projects ORDER BY rowid').map(toProject);
    },
  };
}
