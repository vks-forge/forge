/**
 * Chat groups: which lines of a transcript open a group and which open a new day.
 *
 * Why: a chat that repeats "You 12:01:03" over every line is noisy; one that never says who
 *   spoke is unreadable. Consecutive messages from one author within a few minutes read as one
 *   turn, so the author and time are shown once, above the first. A change of author, a gap of
 *   more than five minutes, a non-speech line in between (a tool call, a note) or a new day
 *   starts a new group, and a new day also gets a separator ("Today", "Yesterday", a date) so a
 *   long history stays anchored in time. Pure: `now` is a parameter, so labels are testable.
 *
 * Exports: groupChat(), dayLabel(), GROUP_GAP_MS.
 * Depends on: types/chat.types. No IO.
 */

import type { ChatGroupInput, ChatRowMeta } from '#/types/chat.types.js';

/** Messages from one author further apart than this start a new group. */
export const GROUP_GAP_MS = 5 * 60_000;

const DAY_MS = 24 * 60 * 60_000;

/** The viewer's calendar day of a timestamp, or null when it does not parse. */
function dayStart(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today", "Yesterday", "Mon 12 Oct", with the year when it is not this year. */
export function dayLabel(iso: string, now: number): string {
  const start = dayStart(iso);
  if (start === null) {
    return '';
  }

  const today = dayStart(new Date(now).toISOString()) ?? start;
  const days = Math.round((today - start) / DAY_MS);
  if (days === 0) {
    return 'Today';
  }

  if (days === 1) {
    return 'Yesterday';
  }

  const date = new Date(start);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();

  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** One entry per input item, in order. */
export function groupChat(
  items: readonly ChatGroupInput[],
  now: number,
): readonly ChatRowMeta[] {
  return items.map((item, index) => {
    const previous = items[index - 1];
    const day = dayStart(item.at);
    const previousDay = previous === undefined ? null : dayStart(previous.at);
    const newDay = previous === undefined || day !== previousDay;
    const gap =
      previous === undefined ? Infinity : Date.parse(item.at) - Date.parse(previous.at);

    const header =
      item.author !== null &&
      (newDay || previous?.author !== item.author || !(gap <= GROUP_GAP_MS));

    return { header, day: newDay ? dayLabel(item.at, now) || null : null };
  });
}
