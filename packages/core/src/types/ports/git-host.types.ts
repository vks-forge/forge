/**
 * GitHost port — push a branch, open and merge a pull request.
 *
 * Why: finished work leaves the worktree as a branch on a remote and a PR that the
 *   verification gates then judge. Where that remote is varies (a local bare repo for
 *   offline runs and tests, GitHub through an App installation), and Workers never push
 *   (d-0012). One port lets the engine run the same verify-then-merge flow against
 *   either, keeps credentials inside the adapter, and gives merging a single door
 *   (d-0062, code.md rule 6). The same port tells the engine where the base branch is now, so
 *   it can merge a moved base into a ticket branch instead of parking on a conflict.
 *
 * Exports: PullRequest, PrState, PrStatus, MergeMethod, OpenPrInput, BaseTip, GitHost.
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

/** Where the base branch stands now: a ref the local repository can resolve and the commit it holds. */
export interface BaseTip {
  readonly ref: string;
  readonly sha: string;
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
   * may call this, after `gate_passed` at tier A (one door, code.md rule 6). The merge is
   * pinned to `expectedHeadSha`, the commit the gates judged: if the PR head is anywhere
   * else the host refuses with a `HeadMovedError` and merges nothing.
   */
  merge(
    n: number,
    method: MergeMethod,
    expectedHeadSha: string,
  ): Promise<{ readonly sha: string }>;
  closePr(n: number): Promise<void>;
  /**
   * Brings the base branch's current tip into the local repository and returns it. Hosts with
   * a remote fetch it into a private ref (`refs/forge/base/<branch>`, never a branch the user
   * works on); a project with no remote reports its own `refs/heads/<branch>`. The returned
   * `ref` is what `WorktreeManager.create` can cut from and `mergeIn` can merge. Read-only for
   * the remote: nothing is pushed or forced.
   */
  syncBase(): Promise<BaseTip>;
  deleteBranch(branch: string): Promise<void>;
}
