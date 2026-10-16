/**
 * Plain-words reasons a planning action can be refused.
 *
 * Why: answering a grill question, approving a plan and editing its tickets can each be refused
 *   for reasons that are not the owner's fault and that they can act on: someone else (or the
 *   Director) answered first, the plan moved on to a newer version, the card is no longer ready
 *   for approval, or a removed ticket still has dependents. A generic "Forge reported a
 *   problem" would leave them guessing, so the sentence is chosen from the server's error code
 *   (never its message text) and says what to do next. Anything else falls back to the general
 *   error text.
 *
 * Exports: describeFlowError().
 * Depends on: api/api-error, api/describe-error. No IO.
 */

import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';

const BY_CODE: Readonly<Record<string, string>> = {
  question_not_open:
    'That question is no longer open: it was answered, or the Director moved on. The chat shows where things stand now.',
  stale_plan:
    'A newer version of the plan exists. Open the latest version and review it before approving.',
  phase_mismatch:
    'This card is not waiting for a plan decision any more, so nothing was changed. The page shows its current state.',
  ticket_has_dependents:
    'A ticket you removed still has others that depend on it. Remove those too, or keep it.',
  card_closed: 'This card is closed, so it takes no more changes.',
  server_draining: 'Forge is shutting down. Try again after it restarts.',
};

export function describeFlowError(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    const known = error.code === undefined ? undefined : BY_CODE[error.code];
    if (known !== undefined) {
      return known;
    }
  }

  const { title, detail } = describeError(error);

  return `${title}. ${detail}`;
}
