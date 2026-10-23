/**
 * Setup failure copy: the plain words for the "Forge could not get the workspace ready" card.
 *
 * Why: before a Worker starts, Forge runs the project's setup steps in a fresh copy of it
 *   (installing packages, d-0180). When one stops, the owner needs to know in one read that no
 *   Worker started and nothing was spent, which step failed and what it ran, and the likeliest
 *   reason: the tool is not on this computer (the most common cause, in any language, d-0176), it
 *   ran out of time, or it printed an error to read. The step's own command and name are shown as
 *   data and no tool is assumed. The output tail is untrusted text from a command, so it is cut
 *   to its last lines and drawn as plain text by the card, never as markup. Pure.
 *
 * Exports: SETUP_TAIL_LINES, SKIP_SETUP_CONFIRM, SETUP_SETTLED_AUTO, setupFailureTitle(),
 *   setupFailureLead(), setupFailureHint(), tailLinesOf().
 * Depends on: types/escalation-ui.types. No IO.
 */

import type { WorktreeSetupCause } from '#/types/escalation-ui.types.js';

/** How many lines of what the step printed the card keeps. */
export const SETUP_TAIL_LINES = 40;

/** Said before "Start without setup" goes ahead. */
export const SKIP_SETUP_CONFIRM =
  'The Worker starts without these packages. Checks that need them will likely fail.';

/** The settled line when the owner fixed the steps in settings and Forge tried again by itself. */
export const SETUP_SETTLED_AUTO = 'Setup steps changed; trying again';

const NOT_FOUND =
  /not found|not recognized|no such file|enoent|cannot find|could not be found/i;

/** "Forge could not get FR-3's workspace ready". */
export function setupFailureTitle(ticketId?: string): string {
  return ticketId === undefined
    ? 'Forge could not get the workspace ready'
    : `Forge could not get ${ticketId}’s workspace ready`;
}

/** What happened, in the owner's terms; the step name and command are drawn by the card beside this. */
export function setupFailureLead(cause: WorktreeSetupCause): {
  before: string;
  after: string;
} {
  return {
    before:
      'Before a Worker starts, Forge makes a fresh copy of your project and installs what it needs. The step',
    after: cause.timed_out
      ? 'ran out of time, so no Worker started and nothing was spent.'
      : 'stopped with an error, so no Worker started and nothing was spent.',
  };
}

/** The one hint line: timed out, tool missing, or "read the output". */
export function setupFailureHint(cause: WorktreeSetupCause): string {
  if (cause.timed_out) {
    return 'It ran longer than its time limit and was stopped. Try again, or raise the time limit in the setup step.';
  }

  if (cause.exit_code === null || cause.exit_code === 127 || NOT_FOUND.test(cause.tail)) {
    const tool = cause.command.trim().split(/\s+/)[0] ?? cause.command;

    return `This computer does not have ${tool}, or Forge cannot find it. Install it, or change the setup step.`;
  }

  return 'The last lines it printed are below.';
}

/** The last `count` non-trailing-blank lines of what a step printed. */
export function tailLinesOf(tail: string, count: number = SETUP_TAIL_LINES): string[] {
  const lines = tail.replace(/\s+$/, '').split('\n');

  return tail.trim() === '' ? [] : lines.slice(-count);
}
