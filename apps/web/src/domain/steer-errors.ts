/**
 * Plain-words reasons a message to a running Worker can be refused.
 *
 * Why: `POST /runs/:id/steer` has three refusals a person can act on and they need different
 *   advice: the run is over (read its result instead), the harness cannot take a message while
 *   running (answer its questions or wait), or Forge is shutting down (try again shortly).
 *   Choosing the sentence from the server's error code, never its message text, keeps the
 *   wording in one place. Anything else falls back to the general error text.
 *
 * Exports: describeSteerError().
 * Depends on: api/api-error, api/describe-error. No IO.
 */

import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';

export function describeSteerError(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.code === 'run_not_live') {
      return 'This run has ended, so it can no longer take a message. Your text is kept below.';
    }

    if (error.code === 'steer_unsupported') {
      return 'This Worker’s harness cannot take messages while it runs. Answer its questions when it asks, or wait for it to finish.';
    }

    if (error.code === 'server_draining') {
      return 'Forge is shutting down and is not taking messages. Try again after it restarts.';
    }
  }

  const { title, detail } = describeError(error);

  return `${title}. ${detail}`;
}
