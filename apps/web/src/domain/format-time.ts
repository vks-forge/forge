/**
 * Date and time wording for the settings screens.
 *
 * Why: versions, tests and checks are read months later ("who changed this, and when"), so
 *   times show as a full local date and minute, not a relative "3 days ago" that rots. The
 *   server sends ISO strings for harness and connection rows and epoch milliseconds for
 *   settings versions; both go through here. An unreadable value renders as a dash rather
 *   than "Invalid Date".
 *
 * Exports: formatWhen().
 * Depends on: nothing. Pure.
 */

const FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatWhen(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '—' : FORMAT.format(date);
}
