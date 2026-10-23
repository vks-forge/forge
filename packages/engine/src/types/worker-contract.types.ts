/**
 * Shape of the rules a Worker is given about its shell and about `finish`.
 *
 * Why: the same record goes into the `dispatch_prompt` step input and is rendered into the
 *   Worker prompt, so both sides must agree on its fields.
 *
 * Exports: WorkerContract.
 * Depends on: none. Types only.
 */

/** The instruction block the dispatch prompt must carry. */
export interface WorkerContract {
  readonly finish_rules: readonly string[];
  readonly shell_rules: readonly string[];
  readonly rework_note?: string;
  /** Only on a run that resolves a merge conflict with main: how to combine both changes. */
  readonly conflict_note?: string;
  /** Standard and Full only: what to do when a call is refused as waiting for the owner. */
  readonly owner_wait_rule?: string;
  /** On a resume after the owner answered: one sentence per answered approval. */
  readonly approval_answers?: readonly string[];
}
