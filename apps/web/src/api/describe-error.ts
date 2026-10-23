/**
 * `describeError()`: turns a failed call into a title and a next step in plain words.
 *
 * Why: "Failed to fetch" tells a user nothing. The three causes that matter in practice have
 *   different fixes: Forge is not running (start it), Forge refused the credentials (restart it
 *   so a fresh token is written, then reload), or the UI and server disagree about a payload
 *   (update one of them). Choosing the sentence from the error's `kind` and status, never its
 *   message text, keeps wording in one place and stable.
 *
 *   A refusal for length (a message over the limit that got past the box) is the same sentence
 *   the box itself shows, read from the server's validation `issues`.
 *
 * Exports: describeError().
 * Depends on: api/api-error, domain/message-limit.
 */

import { ApiError } from '#/api/api-error.js';
import { limitFromIssue, overLimitSentence } from '#/domain/message-limit.js';

/** The limit a server refusal names for a too-long field, or null when the body says nothing of length. */
function lengthLimitOf(body: unknown): number | null {
  const issues = (body as { error?: { issues?: unknown } } | null | undefined)?.error
    ?.issues;

  if (!Array.isArray(issues)) {
    return null;
  }

  for (const issue of issues) {
    const message = (issue as { message?: unknown } | null)?.message;
    const limit = typeof message === 'string' ? limitFromIssue(message) : null;

    if (limit !== null) {
      return limit;
    }
  }

  return null;
}

export function describeError(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) {
    if (error.kind === 'network') {
      return {
        title: 'Cannot reach Forge',
        detail: 'Check that Forge is running (`forge start`), then try again.',
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        title: 'Forge did not accept this session',
        detail:
          'Your session ended or Forge restarted. Run `forge open` in a terminal for a fresh link, then try again.',
      };
    }

    if (error.kind === 'payload') {
      return {
        title: 'Forge sent something this version cannot read',
        detail: 'The app and the Forge server may be out of date with each other.',
      };
    }

    const limit = lengthLimitOf(error.body);

    if (limit !== null) {
      return { title: 'That message is too long', detail: overLimitSentence(limit) };
    }

    return { title: 'Forge reported a problem', detail: error.message };
  }

  return {
    title: 'Something went wrong',
    detail: 'Try again; if it keeps happening, reload.',
  };
}
