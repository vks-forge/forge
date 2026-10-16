/**
 * Public API of @forge/git.
 *
 * Why: the app composes the engine with one WorktreeManager and one GitHost per project;
 *   this barrel is the only door into the package so adapters stay swappable.
 *
 * Exports: inspectRepository, listBranches, BranchListing, BranchListingOptions, RepositoryInspection, createGitWorktreeManager, GitWorktreeManagerOptions, GitAuthor, createLocalBareGitHost,
 *   createLocalRepoGitHost, inspectFolderGit, scanSnapshot, initLocalRepo, githubRepoOf, SnapshotTooLargeError, STANDARD_GITIGNORE,
 *   DEFAULT_SNAPSHOT_LIMITS, createGitHubAppGitHost, LocalBareGitHostOptions, GitHubAppGitHost, GitHubAppGitHostOptions, GitHostError, GitHostReason.
 * Depends on: adapters/git-cli, adapters/local-bare, adapters/github-app, shared/host-errors, types/. Re-exports only.
 */

export { createGitHubAppGitHost } from '#/adapters/github-app/git-host.js';
export { initLocalRepo } from '#/adapters/git-cli/init-local-repo.js';
export { inspectFolderGit } from '#/adapters/git-cli/inspect-folder.js';
export { inspectRepository } from '#/adapters/git-cli/inspect-repository.js';
export { listBranches } from '#/adapters/git-cli/list-branches.js';
export {
  DEFAULT_SNAPSHOT_LIMITS,
  STANDARD_GITIGNORE,
  scanSnapshot,
} from '#/adapters/git-cli/snapshot-scan.js';
export { createGitWorktreeManager } from '#/adapters/git-cli/worktree-manager.js';
export { createLocalBareGitHost } from '#/adapters/local-bare/git-host.js';
export { createLocalRepoGitHost } from '#/adapters/local-repo/git-host.js';
export { githubRepoOf } from '#/domain/remote-url.js';
export { GitHostError } from '#/shared/host-errors.js';
export { SnapshotTooLargeError } from '#/shared/snapshot-errors.js';
export type { GitHostReason } from '#/types/host-errors.types.js';
export type {
  BaseLanding,
  LocalRepoGitHostOptions,
  GitHubAppGitHost,
  GitHubAppGitHostOptions,
  LocalBareGitHostOptions,
} from '#/types/git-host.types.js';
export type {
  FolderGitOptions,
  InitLocalRepoOptions,
  InitLocalRepoResult,
  SnapshotLimits,
  SnapshotScanOptions,
} from '#/types/folder-git.types.js';
export type { GitAuthor, GitWorktreeManagerOptions } from '#/types/git-worktree.types.js';
export type { BranchListing, BranchListingOptions } from '#/types/list-branches.types.js';
export type {
  RepositoryInspection,
  RepositoryInspectionOptions,
  RepositoryProblem,
} from '#/types/inspect-repository.types.js';
