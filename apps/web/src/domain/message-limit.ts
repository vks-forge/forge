/**
 * Message limit: the words for how long a chat message may be, so nobody finds out by a refused send.
 *
 * Why: the Director chat and the Worker steer box both refuse a message over 8,000 characters
 *   (core's `CARD_MESSAGE_MAX_CHARS` and `STEER_MESSAGE_MAX`). A long pasted log used to come back
 *   as a bare "request failed validation" with the draft still in the box. The box now counts from
 *   90 percent of the limit ("7,412 / 8,000"), holds Send over it and says in one sentence what to do,
 *   and the same sentence is what a server refusal for length becomes (api/describe-error).
 *
 * Exports: showsCounter(), counterText(), overLimit(), overLimitSentence(), limitFromIssue().
 * Depends on: nothing. Pure.
 */

const COUNT = new Intl.NumberFormat('en-US');

/** The counter appears once the text reaches 90 percent of the limit. */
export function showsCounter(length: number, max: number): boolean {
  return length >= Math.ceil(max * 0.9);
}

/** "7,412 / 8,000". */
export function counterText(length: number, max: number): string {
  return `${COUNT.format(length)} / ${COUNT.format(max)}`;
}

export function overLimit(length: number, max: number): boolean {
  return length > max;
}

/** What to do about a message that is too long, with how long this one is when known. */
export function overLimitSentence(max: number, length?: number): string {
  const this_one = length === undefined ? '' : `; this one has ${COUNT.format(length)}`;

  return `Messages can be up to ${COUNT.format(max)} characters${this_one}. Shorten it or send it in two parts.`;
}

/** The limit named in a server validation issue about length ("<=8000 characters"), or null for any other issue. */
export function limitFromIssue(message: string): number | null {
  const match = /(?:<=|at most|no more than)\s*(\d[\d,]*)\s*characters?/i.exec(message);

  return match?.[1] === undefined ? null : Number(match[1].replaceAll(',', ''));
}
