/**
 * Short, human time labels for timestamps.
 *
 * Why: a card that says "2026-10-16T09:14:03.221Z" is unreadable at a glance; "4 min ago"
 *   tells a user whether a run is alive. Takes `now` as an argument so labels are testable
 *   and the caller decides when to re-render.
 *
 * Exports: timeAgo(), clockTime(), shortTime().
 * Depends on: nothing. No IO.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "4 min ago", "3 h ago", "2 d ago"; falls back to the date after a month. */
export function timeAgo(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return 'unknown time';
  }

  const diff = Math.max(0, now - then);
  if (diff < MINUTE) {
    return 'just now';
  }

  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)} min ago`;
  }

  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} h ago`;
  }

  if (diff < 30 * DAY) {
    return `${Math.floor(diff / DAY)} d ago`;
  }

  return new Date(then).toISOString().slice(0, 10);
}

/** `HH:MM:SS` in the viewer's time zone, for a line in the thread. */
export function clockTime(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
}

/** `HH:MM` in the viewer's time zone, for the header of a group of chat messages. */
export function shortTime(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
