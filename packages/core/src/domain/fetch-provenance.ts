/**
 * Fetch provenance — which URLs the research step may fetch.
 *
 * Why: a fetched page can hold a link written to steer the next fetch to an exfiltration URL (the
 *   query or the card's text in the path). The Director may therefore fetch only URLs it can trace to
 *   something other than page text: this run's own search hits, the card (summary, links, events) or the
 *   owner's answers (d-0144). The check is pure and compares normalised URLs, so nothing a page says
 *   can widen it.
 *
 * Exports: fetchAllowed(), normaliseUrl().
 * Depends on: zod, types/fetch-provenance. No IO.
 */

import { z } from 'zod';
import type { KnownUrls } from '#/types/fetch-provenance.types.js';

const AbsoluteUrl = z.url({ normalize: true });

/** `href` with the fragment dropped, scheme and host in lower case; null when it is not a URL. */
export function normaliseUrl(raw: string): string | null {
  // zod parses with the platform URL class (core has no DOM or node types of its own).
  const parsed = AbsoluteUrl.safeParse(raw);

  return parsed.success ? (parsed.data.split('#')[0] ?? null) : null;
}

/** True when `url` is, after normalisation, one of the known URLs. */
export function fetchAllowed(url: string, known: KnownUrls): boolean {
  const wanted = normaliseUrl(url);
  if (wanted === null) {
    return false;
  }

  return [...known.hits, ...known.cardUrls, ...known.answerUrls].some(
    (u) => normaliseUrl(u) === wanted,
  );
}
