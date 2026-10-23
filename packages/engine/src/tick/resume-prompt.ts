/**
 * The prompt a resumed Worker is given.
 *
 * Why: a resumed harness session holds the whole earlier conversation, so the Worker must be
 *   told that Forge restarted and that its work is still in the worktree, or it may start over
 *   and redo (or undo) what is done. It is also told how to read a refusal it may have seen
 *   while Forge was stopping: a tool call denied as `server_draining` was never judged on its
 *   merits, so the Worker should simply make it again. A call refused as waiting for the owner is
 *   the opposite: it did not run and is not to be retried or worked around until the owner answers.
 *
 * Exports: RESUME_PROMPT.
 * Depends on: nothing. No IO.
 */

/** What the resumed Worker is told: the session is back, check the worktree, do not start over. */
export const RESUME_PROMPT =
  'Forge was restarted while you were working, and your session has been restored. ' +
  'Check the worktree (for example with `git status` and `git diff`) to see what is already ' +
  'done, then continue the task from where you stopped. Do not start over, and finish as ' +
  'you were asked to when the task is complete. If a tool call was refused with the reason ' +
  '`server_draining`, it was refused only because Forge was stopping; make that call again. ' +
  'A call refused as waiting for the owner did not run: do not retry or work around it; ' +
  'finish what does not need it, then end your turn, and you will be resumed with the answer.';
