/**
 * Minimal GitHub REST client with typed, credential-free errors.
 *
 * Why: every GitHost operation is one REST call that can fail in ways the engine must tell
 *   apart: a rejected credential (user must fix the App), a quota (wait), a merge GitHub
 *   refuses (park the ticket, do not retry), a bad request, an outage (retry). This client
 *   maps the status to a `GitHostError` once, truncates the response body, and scrubs the
 *   token and JWT out of the message so a log line can never leak a credential.
 *
 * Exports: createRestClient().
 * Depends on: domain/push-env (redactSecrets), shared/host-errors. IO: HTTP via the injected fetch.
 */

import type { RestClient } from '#/types/github-rest.types.js';
import { redactSecrets } from '#/domain/push-env.js';
import { GitHostError, reasonForStatus } from '#/shared/host-errors.js';

const BODY_LIMIT = 300;

export function createRestClient(apiBase: string, doFetch: typeof fetch): RestClient {
  const base = apiBase.replace(/\/+$/, '');
  return {
    async call(credential, method, path, opts) {
      const accept = opts?.accept ?? [200, 201, 204];
      let res: Response;
      try {
        res = await doFetch(`${base}${path}`, {
          method,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${credential}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'forge',
            ...(opts?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(opts?.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
        });
      } catch (cause) {
        const why = cause instanceof Error ? cause.message : String(cause);
        throw new GitHostError(
          'unavailable',
          redactSecrets(`GitHub ${method} ${path} could not be reached: ${why}`, [
            credential,
          ]),
        );
      }
      const text = await res.text();
      if (accept.includes(res.status)) {
        let json: unknown = null;
        if (text.length > 0) {
          try {
            json = JSON.parse(text);
          } catch {
            throw new GitHostError(
              'unavailable',
              `GitHub ${method} ${path} returned invalid JSON`,
              res.status,
            );
          }
        }
        return { status: res.status, json };
      }
      const rateLimited =
        res.headers.get('x-ratelimit-remaining') === '0' ||
        res.headers.has('retry-after');
      const shown = redactSecrets(text, [credential]).slice(0, BODY_LIMIT);
      throw new GitHostError(
        reasonForStatus(res.status, rateLimited),
        `GitHub ${method} ${path} failed (${res.status}): ${shown}`,
        res.status,
      );
    },
  };
}
