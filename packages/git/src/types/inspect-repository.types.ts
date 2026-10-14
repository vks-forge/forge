/**
 * Types of the repository inspection used when a project is registered.
 *
 * Why: registering a project needs a yes/no with a reason the UI can show; a typed result
 *   keeps the caller from parsing messages.
 *
 * Exports: RepositoryInspectionOptions, RepositoryInspection, RepositoryProblem.
 * Depends on: none. Types only.
 */

export interface RepositoryInspectionOptions {
  /** The folder the user chose for the project. */
  readonly path: string;
  /** The branch (or ref such as `origin/main`) tickets are cut from and merged into. */
  readonly baseBranch: string;
  readonly gitBinary?: string;
}

export type RepositoryProblem =
  'not_a_directory' | 'not_a_repository' | 'not_repository_root' | 'base_branch_missing';

export type RepositoryInspection =
  | { readonly ok: true; readonly baseSha: string }
  | { readonly ok: false; readonly code: RepositoryProblem; readonly message: string };
