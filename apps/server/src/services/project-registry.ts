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
 *   retried on the next use instead of silently serving a stale host. The GitHub connection
 *   a project uses can change after load (the row is re-pointed, the connection disabled or
 *   its App replaced), and a runtime built on the old one would keep minting tokens for it,
 *   so `refresh()` re-reads each served project's row and connection and rebuilds the
 *   runtime when either differs; a project that can no longer be built stops being served
 *   (its tickets park) and is retried on the next refresh.
 *
 * Exports: createProjectRegistry().
 * Depends on: node:path, @forge/core, @forge/engine (ProjectRuntime), @forge/gates
 *   (createScriptGateRunner), @forge/git (createGitWorktreeManager), services/git-host, types/project-registry.
 *   IO: reads storage and settings in load/register; building a runtime only creates objects.
 */

import { join } from 'node:path';
import { InvalidInputError, ProjectConfig } from '@forge/core';
import type {
  GithubConnection,
  Project,
  ProjectConfigView,
  ProjectSettings,
} from '@forge/core';
import type { ProjectRuntime } from '@forge/engine';
import { createScriptGateRunner } from '@forge/gates';
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

/** What a runtime depends on in the connection row: a change to any of it means a rebuild. */
const connectionSignature = (c: GithubConnection | null): string =>
  JSON.stringify(
    c === null ? null : [c.id, c.status, c.app_id, c.app_slug, c.key_secret_name],
  );

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

    // A project scoped to a subfolder is served from the repository's top (d-0124).
    const repoRoot = project.repo_root ?? project.local_path;
    const worktrees = createGitWorktreeManager({
      repoRoot,
      worktreeRoot: join(deps.worktreesDir, project.slug),
      ...(project.subfolder ? { subfolder: project.subfolder } : {}),
    });

    return {
      config,
      gitHost: createProjectGitHost(config, {
        root: repoRoot,
        secrets: deps.secrets,
        now: deps.now,
        connection,
      }),
      gates: deps.gates(worktrees),
      // Script gates and the red proof run owner commands with the same stripped environment as G1.
      scriptGates: createScriptGateRunner({ worktrees, env: process.env }),
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

  /** Logs what reading an old-format settings document left out, so a typo does not silently remove a check. */
  function warnAboutLegacyDocs(slug: string, view: ProjectConfigView): void {
    for (const warning of view.warnings ?? []) {
      deps.log('warn', `settings of project ${slug}: ${warning}`, {
        project: slug,
        version: view.version.project,
      });
    }
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
          warnAboutLegacyDocs(project.slug, view);
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

    async refresh() {
      let rows: Project[];
      try {
        rows = await deps.storage.transaction((tx) => tx.projects.list());
      } catch (error) {
        // Never throws: a failed refresh must not skip the tick; the engine fails closed itself.
        deps.log('warn', 'project refresh failed', { error: String(error) });

        return;
      }

      for (const project of rows) {
        const entry = entries.get(project.slug);
        if (project.status === 'archived') {
          entries.delete(project.slug);

          continue;
        }

        if (!entry && !project.local_path) {
          continue;
        }

        try {
          const connection = await connectionOf(project);
          if (
            entry &&
            entry.project.connection_id === project.connection_id &&
            connectionSignature(entry.connection) === connectionSignature(connection)
          ) {
            continue;
          }

          const view = await deps.config.project(project.slug);
          entries.set(project.slug, {
            project,
            connection,
            runtime: build(project, connection, view.config.project),
            version: view.version.project,
            signature: signatureOf(view.config.project),
          });

          deps.log('info', 'project runtime rebuilt after a connection change', {
            project: project.slug,
          });
        } catch (error) {
          // Fail closed: a runtime on a connection that is gone or unreadable is not served.
          entries.delete(project.slug);
          deps.log('error', 'project could not be served', {
            project: project.slug,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
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
