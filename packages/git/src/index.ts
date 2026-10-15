/**
 * Public API of @forge/git.
 *
 * Why: the app composes the engine with one WorktreeManager and one GitHost per project;
 *   this barrel is the only door into the package so adapters stay swappable.
 *
 * Exports: inspectRepository, listBranches, BranchListing, BranchListingOptions, RepositoryInspection, createGitWorktreeManager, GitWorktreeManagerOptions, GitAuthor, createLocalBareGitHost,
 *   createGitHubAppGitHost, LocalBareGitHostOptions, GitHubAppGitHost, GitHubAppGitHostOptions, GitHostError, GitHostReason.
 * Depends on: adapters/git-cli, adapters/local-bare, adapters/github-app, shared/host-errors, types/. Re-exports only.
 */

export { createGitHubAppGitHost } from '#/adapters/github-app/git-host.js';
export { inspectRepository } from '#/adapters/git-cli/inspect-repository.js';
export { listBranches } from '#/adapters/git-cli/list-branches.js';
export { createGitWorktreeManager } from '#/adapters/git-cli/worktree-manager.js';
export { createLocalBareGitHost } from '#/adapters/local-bare/git-host.js';
export { GitHostError } from '#/shared/host-errors.js';
export type { GitHostReason } from '#/types/host-errors.types.js';
export type {
  GitHubAppGitHost,
  GitHubAppGitHostOptions,
  LocalBareGitHostOptions,
} from '#/types/git-host.types.js';
export type { GitAuthor, GitWorktreeManagerOptions } from '#/types/git-worktree.types.js';
export type { BranchListing, BranchListingOptions } from '#/types/list-branches.types.js';
export type {
  RepositoryInspection,
  RepositoryInspectionOptions,
  RepositoryProblem,
} from '#/types/inspect-repository.types.js';
