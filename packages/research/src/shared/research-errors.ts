/**
 * Research error mapping — turns a guard or network failure into the port's typed error.
 *
 * Why: the SSRF guard and the HTTP clients fail in different ways (a refused host, a timeout, an HTTP
 *   status, a connection refused). The Director's research step and the settings page's Test button
 *   need one small vocabulary they can show in plain words and act on (`unreachable` says "start
 *   SearXNG", `denied` says "that host is not allowed"), and a provider must never throw an outage into
 *   the engine tick. Retry and wording read the kind, not the message (code.md rule 7).
 *
 * Exports: toResearchError(), researchError().
 * Depends on: @forge/core (PolicyDeniedError, InvalidInputError, ResearchError). No IO.
 */

import { InvalidInputError, PolicyDeniedError } from '@forge/core';
import type { ResearchError, ResearchErrorKind } from '@forge/core';

/** Builds a typed error. */
export function researchError(kind: ResearchErrorKind, message: string): ResearchError {
  return { kind, message };
}

const RULES: readonly [RegExp, ResearchErrorKind][] = [
  [/timed out/i, 'timeout'],
  [/HTTP \d{3}/i, 'http_error'],
  [/unsupported content type|unexpected response/i, 'bad_content'],
  [/too large/i, 'too_large'],
  [/not configured/i, 'not_configured'],
  [/could not resolve|request failed/i, 'unreachable'],
];

/** The typed error for anything a guard, a transport or `fetch` threw. */
export function toResearchError(err: unknown): ResearchError {
  if (err instanceof PolicyDeniedError) {
    return researchError('denied', err.message);
  }

  if (err instanceof InvalidInputError) {
    const hit = RULES.find(([re]) => re.test(err.message));

    return researchError(hit ? hit[1] : 'denied', err.message);
  }

  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return researchError('timeout', 'the request took too long and was stopped');
  }

  const cause = err instanceof Error ? err.message : 'unknown error';

  return researchError('unreachable', `could not reach the server (${cause})`);
}
