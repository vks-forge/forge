/**
 * Types of the project registry: what it needs and what it offers.
 *
 * Why: the registry is the app's one place that turns project rows and settings into
 *   runtimes, and the routes and the engine both call it; a named shape keeps their
 *   contract in one place.
 *
 * Exports: ProjectRegistryDeps, ProjectRegistry, ProjectEntry.
 * Depends on: @forge/core, @forge/engine (ProjectRuntime, Logger). Types only.
 */

import type {
  ConfigSource,
  Gate,
  GithubConnection,
  Project,
  ProjectConfigView,
  ProjectSettings,
  SecretStore,
  StorageAdapter,
  WorktreeManager,
} from '@forge/core';
import type { Logger, ProjectRuntime } from '@forge/engine';

export interface ProjectRegistryDeps {
  readonly storage: StorageAdapter;
  readonly config: ConfigSource;
  readonly secrets: SecretStore;
  /** `<dataHome>/worktrees`; each project's worktrees go under `<worktreesDir>/<slug>`. */
  readonly worktreesDir: string;
  /** The gates of a project, over that project's worktrees. */
  readonly gates: (worktrees: WorktreeManager) => Gate[];
  readonly now: () => number;
  readonly log: Logger;
}

/** One served project: its row, its connection, the runtime and what that runtime was built from. */
export interface ProjectEntry {
  readonly project: Project;
  readonly connection: GithubConnection | null;
  runtime: ProjectRuntime;
  /** The project settings version the runtime was last checked against. */
  version: number;
  /** The settings the runtime depends on (git host), to tell a real change from an unrelated edit. */
  signature: string;
}

export interface ProjectRegistry {
  /** Serves every non-archived project in the database; projects with no local clone path are skipped with a warning. */
  load(): Promise<void>;
  /** Builds and keeps the runtime of a project; throws (and keeps nothing) when it cannot be built. */
  register(project: Project, view: ProjectConfigView): Promise<void>;
  /** Builds a runtime from `settings` and throws if it cannot, without keeping it (validation before saving). */
  check(project: Project, settings: ProjectSettings): Promise<void>;
  /**
   * Re-reads every project's row and GitHub connection and rebuilds the runtime of a project
   * whose connection (or the link to it) changed since it was built; a project that can no
   * longer be built is dropped from service and retried on the next call. Archived rows are dropped. Never throws.
   */
  refresh(): Promise<void>;
  /** Stops serving a project. Its rows stay. */
  archive(slug: string): void;
  /**
   * The runtime of `slug` for the tick that read `view`, or null when the project is not
   * served. When `view`'s project settings version differs from the one the runtime was last
   * checked against and the git host settings changed, the runtime is rebuilt first.
   */
  runtime(slug: string, view: ProjectConfigView | undefined): ProjectRuntime | null;
  /** Slugs being served. */
  slugs(): string[];
}
