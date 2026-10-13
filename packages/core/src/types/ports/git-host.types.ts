/**
 * GitHost port — push a branch, open and merge a pull request.
 *
 * Why: finished work leaves the worktree as a branch on a remote and a PR that the
 *   verification gates then judge. Where that remote is varies (a local bare repo for
 *   offline runs and tests, GitHub through an App installation), and Workers never push
 *   (d-0012). One port lets the engine run the same verify-then-merge flow against
 *   either, keeps credentials inside the adapter, and gives merging a single door
 *   (d-0062, code.md rule 6).
 *
 * Exports: PullRequest, PrState, PrStatus, MergeMethod, OpenPrInput, GitHost.
 * Depends on: none. Types only.
 */

/** A pull request as the host numbers it. */
export interface PullRequest {
  readonly number: number;
  readonly url: string;
}

export type PrState = 'open' | 'closed' | 'merged';

/** Current state of a PR; `mergeable` is null while the host has not computed it. */
export interface PrStatus {
  readonly state: PrState;
  readonly mergeable: boolean | null;
  readonly headSha: string;
}

export type MergeMethod = 'squash' | 'merge';

export interface OpenPrInput {
  readonly branch: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
}

/** Remote operations for one repository. Failures throw ForgeError subclasses. */
export interface GitHost {
  /** Pushes `branch` from the worktree to the remote under the same name. */
  push(worktreePath: string, branch: string): Promise<void>;
  openPr(input: OpenPrInput): Promise<PullRequest>;
  /**
   * The open PR whose head is `branch`, or null. Lets a caller that crashed after
   * `openPr` returned (before it stored the number) adopt the PR instead of opening a
   * second one.
   */
  findPr(branch: string): Promise<PullRequest | null>;
  prStatus(n: number): Promise<PrStatus>;
  /**
   * Merges an open PR and returns the resulting commit sha. Only the engine's merge step
   * may call this, after `gate_passed` at tier A (one door, code.md rule 6).
   */
  merge(n: number, method: MergeMethod): Promise<{ readonly sha: string }>;
  closePr(n: number): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
}
