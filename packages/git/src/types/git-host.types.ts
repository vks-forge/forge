/**
 * Option bags for the GitHost adapters.
 *
 * Why: the app composes a GitHost from project config plus a few seams (clock, fetch, git
 *   runner, key reader). Naming them once keeps the adapter files short and lets tests
 *   swap the network, the git process and the key source without touching adapter code.
 *
 * Exports: LocalBareGitHostOptions, GitHubAppGitHostOptions.
 * Depends on: types/git-worktree. Types only.
 */

import type { GitAuthor, GitRunner } from '#/types/git-worktree.types.js';

export interface LocalBareGitHostOptions {
  /** Path of the bare repository that plays the remote. */
  readonly remotePath: string;
  /** Branch PRs merge into. */
  readonly baseBranch: string;
  /** Epoch milliseconds, for PR record timestamps. */
  readonly now: () => number;
  readonly gitBinary?: string;
  /** Git process seam; defaults to the real binary named by `gitBinary`. */
  readonly git?: GitRunner;
  /** Identity on merge commits; defaults to Forge <forge@localhost>. */
  readonly author?: GitAuthor;
}

export interface GitHubAppGitHostOptions {
  readonly owner: string;
  readonly repo: string;
  readonly baseBranch: string;
  /** GitHub App id (digits); the JWT `iss`. */
  readonly appId: string;
  readonly installationId: string;
  /** Reads the App's PEM private key on demand; the bytes are never stored or logged. */
  readonly privateKey: () => Promise<Uint8Array>;
  readonly fetch?: typeof fetch;
  /** Defaults to https://api.github.com. */
  readonly apiBase?: string;
  /** Where `git push` goes; defaults to https://github.com. */
  readonly gitBase?: string;
  /** Epoch milliseconds; defaults to Date.now. */
  readonly now?: () => number;
  /** Git process seam for push; defaults to the real git binary. */
  readonly git?: GitRunner;
}
