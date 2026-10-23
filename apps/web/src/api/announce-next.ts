/**
 * announceNext(): says what happens now after the owner answered or acted.
 *
 * Why: once an answer is sent its item leaves Needs you at once, and the owner is left wondering
 *   "so what now?" ("Re-plan" does not start a Worker; the Director plans first and asks again).
 *   The server's reply carries one plain line for it (`next`, from the same derivation as the
 *   ticket's phase); a short notice repeats it where the owner is looking. A reply without the
 *   line (an older server, or nothing to say) shows nothing, never a made-up sentence.
 *
 * Exports: announceNext().
 * Depends on: state/notify/notify-store.
 */

import { notifyStore } from '#/state/notify/notify-store.js';

const NEXT_NOTICE_MS = 8000;

export function announceNext(next: string | undefined): void {
  if (next === undefined || next.trim() === '') {
    return;
  }

  notifyStore.info(next, { id: 'answer-next', duration: NEXT_NOTICE_MS });
}
