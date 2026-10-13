/**
 * Public API of @forge/git.
 *
 * Why: the app composes the engine with one WorktreeManager and one GitHost per project;
 *   this barrel is the only door into the package so adapters stay swappable.
 *
 * Exports: createGitWorktreeManager, GitWorktreeManagerOptions, GitAuthor, createLocalBareGitHost,
 *   createGitHubAppGitHost, LocalBareGitHostOptions, GitHubAppGitHostOptions, GitHostError, GitHostReason.
 * Depends on: adapters/git-cli, adapters/local-bare, adapters/github-app, shared/host-errors, types/. Re-exports only.
 */

export { createGitHubAppGitHost } from '#/adapters/github-app/git-host.js';
export { createGitWorktreeManager } from '#/adapters/git-cli/worktree-manager.js';
export { createLocalBareGitHost } from '#/adapters/local-bare/git-host.js';
export { GitHostError } from '#/shared/host-errors.js';
export type { GitHostReason } from '#/types/host-errors.types.js';
export type {
  GitHubAppGitHostOptions,
  LocalBareGitHostOptions,
} from '#/types/git-host.types.js';
export type { GitAuthor, GitWorktreeManagerOptions } from '#/types/git-worktree.types.js';
