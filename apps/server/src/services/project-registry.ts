/**
 * Project registry: one runtime per served project, added and rebuilt while the server runs.
 *
 * Why: a Forge install manages many repositories (d-0082). Each project has its own clone,
 *   worktree folder, git host, gates and base branch, and the engine must use the right
 *   set for every ticket (never project A's worktrees for project B's ticket). The registry
 *   builds those from the project row and its settings, holds them by slug, lets the API
 *   add a project without a restart, and stops serving an archived one. The git host
 *   depends on settings the user can edit, so each tick passes the settings it read and the
 *   registry rebuilds the runtime when the project's settings version moved and the git
 *   host part changed; an unrelated edit (a command, a tier-C path) costs nothing. A
 *   rebuild that fails keeps the old version number unset, so the error is reported and
 *   retried on the next use instead of silently serving a stale host.
 *
 * Exports: createProjectRegistry().
 * Depends on: node:path, @forge/core, @forge/engine (ProjectRuntime), @forge/git
 *   (createGitWorktreeManager), services/git-host, types/project-registry.
 *   IO: reads storage and settings in load/register; building a runtime only creates objects.
 */

import { join } from 'node:path';
import { InvalidInputError, ProjectConfig } from '@forge/core';
import type { GithubConnection, Project, ProjectSettings } from '@forge/core';
import type { ProjectRuntime } from '@forge/engine';
import { createGitWorktreeManager } from '@forge/git';
import { createProjectGitHost } from '#/services/git-host.js';
import type {
  ProjectEntry,
  ProjectRegistry,
  ProjectRegistryDeps,
} from '#/types/project-registry.types.js';

const DEFAULT_BASE = 'main';

/** The part of the settings a runtime is built from; a change here (and only here) rebuilds it. */
const signatureOf = (settings: ProjectSettings): string =>
  JSON.stringify(settings.git_host ?? null);

export function createProjectRegistry(deps: ProjectRegistryDeps): ProjectRegistry {
  const entries = new Map<string, ProjectEntry>();

  function build(
    project: Project,
    connection: GithubConnection | null,
    settings: ProjectSettings,
  ): ProjectRuntime {
    if (!project.local_path) {
      throw new InvalidInputError(`project ${project.slug} has no local clone path`);
    }

    const config = ProjectConfig.parse({
      slug: project.slug,
      prefix: project.prefix,
      ...settings,
    });

    const worktrees = createGitWorktreeManager({
      repoRoot: project.local_path,
      worktreeRoot: join(deps.worktreesDir, project.slug),
    });

    return {
      config,
      gitHost: createProjectGitHost(config, {
        root: project.local_path,
        secrets: deps.secrets,
        now: deps.now,
        connection,
      }),
      gates: deps.gates(worktrees),
      worktrees,
      baseRef: config.git_host?.base_branch ?? DEFAULT_BASE,
    };
  }

  async function connectionOf(project: Project): Promise<GithubConnection | null> {
    if (!project.connection_id) {
      return null;
    }

    const id = project.connection_id;
    const found = await deps.storage.transaction((tx) => tx.githubConnections.get(id));
    if (!found) {
      throw new InvalidInputError(
        `project ${project.slug} names GitHub connection ${id}, which does not exist`,
      );
    }

    return found;
  }

  return {
    async load() {
      const rows = await deps.storage.transaction((tx) => tx.projects.list());
      for (const project of rows) {
        if (project.status === 'archived') {
          continue;
        }

        if (!project.local_path) {
          deps.log('warn', 'project has no local clone path and is not served', {
            project: project.slug,
          });

          continue;
        }

        try {
          const view = await deps.config.project(project.slug);
          const connection = await connectionOf(project);
          entries.set(project.slug, {
            project,
            connection,
            runtime: build(project, connection, view.config.project),
            version: view.version.project,
            signature: signatureOf(view.config.project),
          });
        } catch (error) {
          // One broken project must not keep the others from starting.
          deps.log('error', 'project could not be served', {
            project: project.slug,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },

    async register(project, view) {
      const connection = await connectionOf(project);
      entries.set(project.slug, {
        project,
        connection,
        runtime: build(project, connection, view.config.project),
        version: view.version.project,
        signature: signatureOf(view.config.project),
      });
    },

    async check(project, settings) {
      build(project, await connectionOf(project), settings);
    },

    archive(slug) {
      entries.delete(slug);
    },

    runtime(slug, view) {
      const entry = entries.get(slug);
      if (!entry) {
        return null;
      }

      if (view && view.version.project !== entry.version) {
        const signature = signatureOf(view.config.project);
        if (signature !== entry.signature) {
          entry.runtime = build(entry.project, entry.connection, view.config.project);
          entry.signature = signature;
          deps.log('info', 'project runtime rebuilt after a git host change', {
            project: slug,
            version: view.version.project,
          });
        }

        entry.version = view.version.project;
      }

      return entry.runtime;
    },

    slugs: () => [...entries.keys()].sort(),
  };
}
