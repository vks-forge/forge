/**
 * What a research run may start from: the outside claims earlier steps flagged and the URLs the engine already knows.
 *
 * Why: the research step must not take its next fetch from page text (d-0144). The only URLs it may fetch, besides
 *   its own search results, are ones the engine can trace to the card (title, summary, links, the owner's chat
 *   messages) or to the owner's own answers. And what it is asked to check comes from the earlier steps: a risk
 *   they wrote that starts with "OUTSIDE CLAIM". Nothing here reads repository files or page text.
 *
 * Exports: claimsToCheck(), knownUrls().
 * Depends on: @forge/core (GrillState), types/card-planning, types/research-run. Reads the card's events.
 */

import type { GrillState } from '@forge/core';
import type { PlanCtx } from '#/types/card-planning.types.js';
import type { KnownCardUrls } from '#/types/research-run.types.js';

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/g;

const urlsIn = (text: string): string[] =>
  (text.match(URL_PATTERN) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ''));

/** The outside claims earlier steps flagged: risks that start with "OUTSIDE CLAIM". */
export function claimsToCheck(g: GrillState): string[] {
  return [...(g.verify?.risks ?? []), ...(g.survey?.risks ?? [])].filter((r) =>
    /^outside claim/i.test(r.trim()),
  );
}

/** The URLs the engine knows without any page text: the card's own words and links, and the owner's answers. */
export async function knownUrls(pc: PlanCtx, g: GrillState): Promise<KnownCardUrls> {
  const events = await pc.ctx.deps.storage.transaction((tx) =>
    tx.cardEvents.list(pc.card.id, { limit: 200 }),
  );

  const ownerWords = events.flatMap((e) =>
    e.kind === 'user_message' ? [e.payload.text] : [],
  );

  return {
    cardUrls: [
      ...pc.card.links,
      ...urlsIn(pc.card.title),
      ...urlsIn(pc.card.summary),
      ...ownerWords.flatMap(urlsIn),
    ],
    answerUrls: g.answers
      .filter((a) => a.by === 'owner')
      .flatMap((a) => urlsIn(a.answer)),
  };
}
