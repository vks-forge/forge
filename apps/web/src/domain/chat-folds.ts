/**
 * Chat folds: collapses long runs of ticket log lines into one line.
 *
 * Why: while Workers build, a card's chat fills with "created", "moved", "asked" lines, ten to
 *   twenty of them between two Director messages, and the owner scrolls past them to find what
 *   the Director said. A run of three or more becomes one quiet line that says in words what
 *   happened and where tickets stand now, and opens to the originals, so no state change is
 *   lost and nothing the owner may be watching is hidden. A fold never swallows speech, a
 *   question, an escalation or a plan line (they carry no `fold` mark) and never spans a day
 *   separator. The key is the first line's, so a fold stays open or closed when the list is
 *   refetched or a new ticket line arrives. Pure and `now`-free.
 *
 * Exports: foldTicketRuns(), FOLD_MIN_RUN.
 * Depends on: types/cards-ui.types, types/chat.types. No IO.
 */

import type { ChatFold, ChatItem, ChatLine } from '#/types/cards-ui.types.js';
import type { ChatRowMeta } from '#/types/chat.types.js';

/** Two ticket lines read fine; folding them would cost a tap for no gain. */
export const FOLD_MIN_RUN = 3;

const SHOWN_TICKETS = 3;

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** "3 tickets moved · 2 created", then where up to three tickets stand now. */
function summaryOf(lines: readonly ChatLine[]): string {
  const moved = new Set<string>();
  const standing = new Map<string, string>();
  let movedLines = 0;
  let created = 0;
  let asked = 0;

  for (const line of lines) {
    if (line.ticketEvent === 'created') {
      created += 1;
    } else if (line.ticketEvent === 'asked') {
      asked += 1;
    } else if (line.ticketEvent === 'moved') {
      movedLines += 1;

      if (line.ticketId !== undefined) {
        moved.add(line.ticketId);

        if (line.toState !== undefined) {
          standing.set(line.ticketId, line.toState);
        }
      }
    }
  }

  const movedCount = moved.size > 0 ? moved.size : movedLines;
  const parts = [
    ...(movedCount > 0 ? [`${plural(movedCount, 'ticket', 'tickets')} moved`] : []),
    ...(created > 0 ? [`${created} created`] : []),
    ...(asked > 0 ? [`${plural(asked, 'question', 'questions')} asked`] : []),
  ];

  const head = parts.length > 0 ? parts.join(' · ') : `${lines.length} updates`;
  const entries = [...standing.entries()];

  if (entries.length === 0) {
    return head;
  }

  const shown = entries.slice(0, SHOWN_TICKETS).map(([id, state]) => `${id} ${state}`);
  const rest = entries.length - SHOWN_TICKETS;

  return `${head}: ${shown.join(', ')}${rest > 0 ? `, +${rest}` : ''}`;
}

/**
 * The transcript as items: each line as is, except a run of `FOLD_MIN_RUN` or more consecutive
 * `fold` lines inside one day, which becomes a single fold. `metas[i]` belongs to `lines[i]`;
 * a meta with a `day` label starts a new day and so ends any run before it.
 */
export function foldTicketRuns(
  lines: readonly ChatLine[],
  metas: readonly ChatRowMeta[],
): readonly ChatItem[] {
  const items: ChatItem[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] as ChatLine;

    if (line.fold === undefined) {
      items.push({ kind: 'line', line, index });
      index += 1;
      continue;
    }

    let end = index + 1;

    while (
      end < lines.length &&
      lines[end]?.fold !== undefined &&
      (metas[end]?.day ?? null) === null
    ) {
      end += 1;
    }

    const run = lines.slice(index, end);

    if (run.length < FOLD_MIN_RUN) {
      run.forEach((one, offset) => {
        items.push({ kind: 'line', line: one, index: index + offset });
      });
    } else {
      const fold: ChatFold = { key: line.key, lines: run, summary: summaryOf(run) };

      items.push({ kind: 'fold', fold, index });
    }

    index = end;
  }

  return items;
}
