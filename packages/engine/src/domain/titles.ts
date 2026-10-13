/**
 * Working title for a ticket before triage names it.
 *
 * Why: a ticket row needs a non-empty title the moment intake creates it, but the real
 *   title comes from the triage step one tick later. The first line of the request is a
 *   readable stand-in for the inbox view in between.
 *
 * Exports: deriveTitle(), MAX_TITLE.
 * Depends on: nothing. No IO.
 */

export const MAX_TITLE = 120;

/** First non-empty line of `text`, trimmed and capped at {@link MAX_TITLE}. */
export function deriveTitle(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? 'Untitled request';

  return line.trim().slice(0, MAX_TITLE);
}
