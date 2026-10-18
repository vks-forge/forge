/**
 * SearXNG base URL check — the search endpoint must be loopback or explicitly trusted.
 *
 * Why: every query leaves the machine for whatever answers at the base URL. A mis-set URL must not leak
 *   a Worker's or the Director's queries to a third party, so the endpoint is accepted only when it is
 *   http(s), carries no credentials and is loopback or an exact host the owner listed in settings
 *   (tool-system.md §9). The check runs on every search, not only when settings are saved, because the
 *   value can also arrive from a dev override.
 *
 * Exports: validateSearxngBase().
 * Depends on: @forge/core, node:net, shared/ip-guard. No IO.
 */

import { InvalidInputError, PolicyDeniedError } from '@forge/core';
import { isIP } from 'node:net';
import { isLoopbackAddress } from '#/shared/ip-guard.js';

/** Returns the base URL when it is loopback or allow-listed; throws PolicyDeniedError otherwise. */
export function validateSearxngBase(
  baseUrl: string | undefined,
  allowHosts: readonly string[] = [],
): URL {
  if (!baseUrl) {
    throw new InvalidInputError('web search is not configured (no SearXNG URL)');
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new InvalidInputError('the SearXNG URL is not a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PolicyDeniedError('SearXNG URL must be http or https');
  }

  if (url.username || url.password) {
    throw new PolicyDeniedError('SearXNG URL must not embed credentials');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = host === 'localhost' || (isIP(host) !== 0 && isLoopbackAddress(host));
  if (!loopback && !allowHosts.map((h) => h.toLowerCase()).includes(host)) {
    throw new PolicyDeniedError(
      `SearXNG host ${host} is not loopback and not allow-listed`,
    );
  }

  return url;
}
