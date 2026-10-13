/**
 * Output tail helper.
 *
 * Why: a failing test run can print megabytes; the Worker's rework prompt needs the end,
 *   where the failure summary is, not the start. Bounded tails keep reports small.
 *
 * Exports: tail(), TAIL_BYTES.
 * Depends on: none. No IO.
 */

export const TAIL_BYTES = 4096;

/** The last `max` characters of `text`, marked when cut. */
export function tail(text: string, max: number = TAIL_BYTES): string {
  if (text.length <= max) {
    return text;
  }

  return `[...cut...]\n${text.slice(text.length - max)}`;
}
