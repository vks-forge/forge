/**
 * System DNS resolver for web fetches.
 *
 * Why: the SSRF guard needs every address a name points at, not just the first one the
 *   OS would pick, because an attacker publishes one public and one private record and
 *   hopes only the public one is checked.
 *
 * Exports: systemResolve().
 * Depends on: node:dns. IO: DNS lookup.
 */

import { lookup } from 'node:dns/promises';

/** Every A/AAAA address for `host` (empty when none). */
export async function systemResolve(host: string): Promise<string[]> {
  const found = await lookup(host, { all: true, verbatim: true });

  return found.map((f) => f.address);
}
