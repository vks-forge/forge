/**
 * Public API of @forge/git.
 *
 * Why: the app composes the engine with one WorktreeManager; this barrel is the only
 *   door into the package so adapters stay swappable.
 *
 * Exports: createGitWorktreeManager, GitWorktreeManagerOptions, GitAuthor.
 * Depends on: adapters/git-cli, types/git-worktree. Re-exports only.
 */

export { createGitWorktreeManager } from '#/adapters/git-cli/worktree-manager.js';
export type { GitAuthor, GitWorktreeManagerOptions } from '#/types/git-worktree.types.js';
