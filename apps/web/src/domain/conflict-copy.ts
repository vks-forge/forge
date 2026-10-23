/**
 * Conflict copy: the words of a stop where a ticket's changes clash with work that merged first.
 *
 * Why: the owner never resolves a conflict by hand, so this card is where they choose between one
 *   more attempt, a new plan and giving up. The Worker already tried twice to combine both changes;
 *   the owner needs to see which files clash and who changed them first (a ticket id when the
 *   commit names one), what each button does (Try again is one more attempt, Re-plan this ticket
 *   re-plans the card for now and keeps merged work, Cancel deletes the branch) and nothing that
 *   assumes a language or tool. It also words the two relabelled buttons and the note the re-plan
 *   starts with, so the card, the actions and the dialog agree. Plain words only.
 *
 * Exports: CONFLICT_ACTION_LABEL, CONFLICT_RETRY_HINT, FILES_SHOWN, conflictHelp(), conflictReplan(),
 *   upstreamLine(), visibleFiles().
 * Depends on: schemas/escalation (types), types/escalation-ui.types (types). Pure.
 */

import type { EscalationAction } from '#/schemas/escalation.js';
import type { ConflictDetail, ConflictReplan } from '#/types/escalation-ui.types.js';

/** The two buttons that say more on a merge-conflict stop than their usual names. */
export const CONFLICT_ACTION_LABEL: Readonly<Partial<Record<EscalationAction, string>>> =
  {
    retry: 'Try again',
    replan: 'Re-plan this ticket',
  };

/** The line under Try again. */
export const CONFLICT_RETRY_HINT =
  'This gives it one more attempt to combine both changes.';

/** How many clashing files the card lists before the rest sit behind a count. */
export const FILES_SHOWN = 5;

function joinWords(words: readonly string[]): string {
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The explanation under the summary: who changed what first, what Forge did, and what each button does. */
export function conflictHelp(conflict: ConflictDetail | undefined): string {
  const ids = [...new Set((conflict?.upstream ?? []).flatMap((u) => u.ticket_id ?? []))];

  const files = conflict?.files ?? [];
  const who =
    ids.length > 0 ? joinWords(ids) : files.length > 0 ? 'Other work' : 'Another ticket';

  const what =
    files.length === 0
      ? 'the same files'
      : files.length <= 2
        ? joinWords(files)
        : `${files.length} files`;

  return `${who} changed ${what} first. Forge merged the newest main into this ticket and asked the Worker to combine both changes; it could not finish. Try again gives it one more attempt with your note. Re-plan this ticket asks the Director for a new plan, keeping work that already merged. Cancel stops it.`;
}

/** What the Re-plan dialog says and starts with; v1 re-plans the whole card, and says so. */
export function conflictReplan(ticketId: string): ConflictReplan {
  return {
    title: 'Re-plan this ticket?',
    description:
      'Forge cannot re-plan one ticket alone yet, so the whole card goes back to the Director with your comment. Work that already merged stays merged; tickets that have not started are replaced when you approve the new plan.',
    comment: `Re-plan only ${ticketId}; keep merged tickets`,
  };
}

/** One upstream change as a line: the ticket and its title, or the title and the commit when no ticket is named. */
export function upstreamLine(upstream: ConflictDetail['upstream'][number]): string {
  return upstream.ticket_id === undefined
    ? `${upstream.title} (${upstream.ref})`
    : `${upstream.ticket_id}: ${upstream.title}`;
}

/** The files drawn at once and those behind "Show N more files". */
export function visibleFiles(files: readonly string[]): {
  shown: string[];
  hidden: string[];
} {
  return { shown: files.slice(0, FILES_SHOWN), hidden: files.slice(FILES_SHOWN) };
}
