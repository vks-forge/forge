/**
 * Shared pieces of the research scenarios: the scripted run, a rig with a research provider and readers.
 *
 * Why: every research scenario tells the same story (a card is planned, the Director researches an outside
 *   fact, the engine stores and checks what it found) and differs in one rule it pins. The standard run, the
 *   good and the invented claim and the readers of stored sources and evidence live here so each scenario
 *   file states only its own rule.
 *
 * Exports: CLAIM, GOOD_QUOTE, BAD_QUOTE, search(), fetchOf(), findings(), goodClaim, badClaim, standardRun(),
 *   rigWith(), planThrough(), sourcesOf(), evidenceOf(), spendOf(), setResearchCaps().
 * Depends on: @forge/core, helpers/planning-rig, helpers/rig. No IO.
 */

import type { CardId } from '@forge/core';
import { answerWith, createPlanCard, planningRig } from '#tests/helpers/planning-rig.js';
import type { Rig } from '#tests/helpers/rig.js';

export const CLAIM = 'The Widget API allows 100 requests per minute.';
export const GOOD_QUOTE = 'rate limit of 100 requests per minute for every key';
export const BAD_QUOTE = 'this exact sentence is not on the page at all';

export const search = (query = 'widget api rate limit') => ({ op: 'search', query });
export const fetchOf = (url = 'https://docs.example.com/widget') => ({
  op: 'fetch',
  url,
});

export const findings = (claims: unknown[], extra: Record<string, unknown> = {}) => ({
  findings: { summary: 'Looked it up.', claims, unanswered: [], ...extra },
});

export const goodClaim = {
  text: CLAIM,
  quotes: [{ source: 'S1', quote: GOOD_QUOTE }],
  question: 'What is the limit?',
};

export const badClaim = {
  text: 'The Widget API is free forever for everyone.',
  quotes: [{ source: 'S1', quote: BAD_QUOTE }],
};

/** The standard run: search, fetch the hit, report a good and an invented claim. */
export const standardRun = () => [
  { research_requests: [search()] },
  { research_requests: [fetchOf()] },
  findings([goodClaim, badClaim]),
];

export async function rigWith(over: { research?: boolean } = {}): Promise<Rig> {
  return planningRig({ research: over.research ?? true });
}

/** Plans a card up to the owner's answer to the one grill question; the next tick runs the rest. */
export async function planThrough(rig: Rig): Promise<CardId> {
  const id = await createPlanCard(rig);
  await rig.tick();
  await answerWith(rig, id);
  await rig.tick();

  return id;
}

export const sourcesOf = (rig: Rig, id: CardId) =>
  rig.storage.transaction((tx) => tx.researchSources.listByCard(id));

export const evidenceOf = (rig: Rig, id: CardId) =>
  rig.storage.transaction((tx) => tx.evidence.listByCard(id));

export const spendOf = async (rig: Rig, id: CardId) =>
  (await rig.storage.transaction((tx) => tx.cardPlanning.get(id))).grill
    .director_spend_usd;

export async function setResearchCaps(rig: Rig, caps: Record<string, unknown>) {
  await rig.config.append({
    scope: 'company',
    doc: { director: { research: caps } },
    author: 'test',
    reason: 'caps',
    expectedVersion: (await rig.config.company()).version,
  });
}
