/**
 * TEMPORARY bridge (removed by B4): register the served project from `.forge/project.yaml` once.
 *
 * Why: settings live in the database (d-0085) but nothing can register a project yet; the
 *   projects API arrives with batch B4. Until then the first start reads `project.yaml` to
 *   learn the project's identity (slug, prefix, remote) and its settings (profile, commands,
 *   git host, harness), writes them as rows (the identity row and settings version 1 by
 *   author "import") and from then on only the database is consulted. The file is never read
 *   again once the project exists, so a setting changed in the UI is not undone by the next
 *   restart. The settings version is saved before the identity row so an import that stops
 *   in between is simply finished by the next start.
 *
 * Exports: ensureProject().
 * Depends on: @forge/core (ProjectConfig, ProjectSettings, ConfigVersionConflictError), @forge/engine (Logger type),
 *   config/load-yaml. IO: reads one yaml file on the first start only.
 */

import { ConfigVersionConflictError, ProjectConfig, ProjectSettings } from '@forge/core';
import type { ConfigSource, Project, StorageAdapter } from '@forge/core';
import type { Logger } from '@forge/engine';
import { loadYaml } from '#/config/load-yaml.js';

/** The `projects` row for an imported project config. */
function rowOf(project: ProjectConfig): Project {
  return {
    id: project.slug,
    slug: project.slug,
    prefix: project.prefix,
    ...(project.remote ? { repo_origin: project.remote } : {}),
    harness_defaults: { default_harness: project.default_harness },
    tier_c_globs: [...project.tier_c_globs],
  };
}

/**
 * The config of the one project this server works on: identity from its row, settings from
 * the config source. Registers it from `project.yaml` first when the database has no project.
 */
export async function ensureProject(deps: {
  readonly storage: StorageAdapter;
  readonly config: ConfigSource;
  readonly projectConfigPath: string;
  readonly log: Logger;
}): Promise<ProjectConfig> {
  const { storage, config } = deps;
  const existing = await storage.transaction((tx) => tx.projects.list());
  let row = existing[0];

  if (!row) {
    const imported = await loadYaml(
      deps.projectConfigPath,
      ProjectConfig,
      'project config',
    );

    // Parsing as settings drops the identity keys, which live on the row.
    const settings = ProjectSettings.parse(imported);

    try {
      await config.append({
        scope: 'project',
        project: imported.slug,
        doc: settings,
        author: 'import',
        reason: 'initial import from project.yaml',
        expectedVersion: 0,
      });
    } catch (error) {
      // An earlier start saved the settings and died before the row: keep them.
      if (!(error instanceof ConfigVersionConflictError)) {
        throw error;
      }
    }

    const created = rowOf(imported);
    await storage.transaction((tx) => tx.projects.upsert(created));
    row = created;
    deps.log('info', 'project registered from project.yaml', { project: imported.slug });
  } else if (existing.length > 1) {
    deps.log('warn', 'several projects are registered; serving the first', {
      project: row.slug,
    });
  }

  const effective = await config.project(row.slug);

  return ProjectConfig.parse({
    slug: row.slug,
    prefix: row.prefix,
    ...effective.config.project,
  });
}
