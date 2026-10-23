/**
 * commitMessage — a commit subject plus the Forge trailers that tie the commit to its work.
 *
 * Why: months later, `git log` is the only record left on the branch. A commit that carries
 *   `Forge-Ticket` and `Forge-Run` lets anyone (or any tool) go from a line of code back to the
 *   ticket and the exact Worker run that produced it, with git alone and for any language. The
 *   trailers sit in git's own trailer block (a blank line, then `Key: value` lines), so
 *   `git interpret-trailers` and `git log --format=%(trailers)` read them with no Forge code.
 *
 * Exports: FORGE_TICKET_TRAILER, FORGE_RUN_TRAILER, commitMessage().
 * Depends on: nothing. No IO.
 */

export const FORGE_TICKET_TRAILER = 'Forge-Ticket';
export const FORGE_RUN_TRAILER = 'Forge-Run';

/** `subject` followed by a blank line and the ticket and run trailers. */
export function commitMessage(
  subject: string,
  ids: { readonly ticketId: string; readonly runId: string },
): string {
  const line = subject.trim().split(/\r?\n/)[0] ?? '';

  return `${line}\n\n${FORGE_TICKET_TRAILER}: ${ids.ticketId}\n${FORGE_RUN_TRAILER}: ${ids.runId}`;
}
