/**
 * Ports for the project and GitHub connection registries.
 *
 * Why: which projects Forge serves and which GitHub App each one uses are registry facts the
 *   engine, routes and CLI all read. They sit apart from the ticket and run ports so the
 *   storage port file stays small enough to read in one sitting.
 *
 * Exports: ProjectRepository, GithubConnectionRepository.
 * Depends on: schemas/github-connection, schemas/project. Types only.
 */

import type { GithubConnection } from '#/schemas/github-connection.js';
import type { Project } from '#/schemas/project.js';

/** The `projects` registry (director-core.md §3). */
export interface ProjectRepository {
  get(id: string): Promise<Project | null>;
  // Insert or replace by id.
  upsert(project: Project): Promise<void>;
  // Remove the row (undoing a registration that did not complete); false when there was none.
  delete(id: string): Promise<boolean>;
  // Remove the project and everything it owns (tickets, runs and their records, cards, inbox
  // marks) in the caller's transaction; settings history stays. False when the slug is unknown.
  purge(slug: string): Promise<boolean>;
  list(): Promise<Project[]>;
}

/** The `github_connections` registry (d-0094): one GitHub App per org or account. Keys live in the SecretStore. */
export interface GithubConnectionRepository {
  get(id: string): Promise<GithubConnection | null>;
  // Insert or replace by id.
  upsert(connection: GithubConnection): Promise<void>;
  // Insert only: false (and nothing written) when a connection with that id exists.
  insertIfAbsent(connection: GithubConnection): Promise<boolean>;
  // Remove the row; false when there was none.
  delete(id: string): Promise<boolean>;
  // Oldest first.
  list(): Promise<GithubConnection[]>;
}
