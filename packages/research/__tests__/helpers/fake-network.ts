/**
 * Fake network ports and settings for the research tests.
 *
 * Why: the providers must be proven with no network, no DNS and no running SearXNG. These stubs answer
 *   with public-looking addresses and canned pages, and any port a test does not set throws, so an
 *   accidental real call fails the test instead of reaching the machine's network.
 *
 * Exports: SETTINGS, htmlPage(), fakeNet(), jsonResponse().
 * Depends on: @forge/core (types), src/types/network.types. No IO.
 */

import type { ResearchSettings } from '@forge/core';
import type { HttpResponse, NetworkPorts } from '#/types/network.types.js';

export const SETTINGS: ResearchSettings = {
  provider: 'searxng',
  searxng: { base_url: 'http://localhost:8888', allow_hosts: [] },
  fetch: { allow_hosts: [], deny_hosts: [], timeout_ms: 10_000 },
};

/** A transport answer carrying `body` as text of `type`. */
export function htmlPage(body: string, type = 'text/html'): HttpResponse {
  return {
    status: 200,
    headers: { 'content-type': type },
    body: Object.assign(
      (async function* () {
        yield new TextEncoder().encode(body);
      })(),
      { destroy: () => undefined },
    ),
  };
}

/** A `fetch` answer carrying the SearXNG JSON for `results`. */
export function jsonResponse(results: unknown[]): Response {
  return new Response(JSON.stringify({ results }), {
    headers: { 'content-type': 'application/json' },
  });
}

/** Ports that resolve every name to a public address; unset ports throw. */
export function fakeNet(over: Partial<NetworkPorts> = {}): NetworkPorts {
  return {
    resolve: async () => ['93.184.216.34'],
    transport: async () => {
      throw new Error('unexpected network access in test');
    },
    fetch: async () => {
      throw new Error('unexpected fetch in test');
    },
    ...over,
  };
}
