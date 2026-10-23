/**
 * Approval answers in the words a resumed Worker is told.
 *
 * Why: the Worker's call did not run; it ended its turn and waits for Forge. When the session
 *   resumes it must be told, per call and in the same words every time, whether to run the call
 *   now (allowed), or to leave it alone and not look for a way around (denied), or the task may
 *   be redone through a back door the owner just refused. The words are fixed here, not left to
 *   the Director's prompt step, and each names the exact command the owner saw
 *   (execution-plane.md §6, d-0175).
 *
 * Exports: renderApprovalAnswers().
 * Depends on: types/approval. No IO.
 */

import type { ApprovalAnswer } from '#/types/approval.types.js';

/** One sentence per answered approval, oldest first. */
export function renderApprovalAnswers(answers: readonly ApprovalAnswer[]): string[] {
  return answers.map((a) => {
    const note =
      a.note === undefined || a.note === '' ? '' : ` The owner added: ${a.note}`;

    switch (a.answer) {
      case 'allow_once':
        return `Allowed once: \`${a.what}\` — run it now exactly as before.${note}`;
      case 'allow_always':
        return `Allowed always: \`${a.what}\` — run it now exactly as before; the owner allowed it for this project from now on.${note}`;
      case 'deny':
        return `Denied: \`${a.what}\` — do not attempt it or work around it; if the task cannot be done without it, call report_blocked.${note}`;
    }
  });
}
