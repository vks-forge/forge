/**
 * Research store: the one writer of the Director's sources and evidence, and their readers.
 *
 * Why: what a research run learned must reach the card as engine-checked facts and nothing else (d-0144,
 *   d-0001). This is the only place the Director's pages and claims are written: it stores each page with
 *   its capped text under the card's own numbering, checks every quote of every claim against the stored
 *   page text (`checkClaims`, so the model never sets a status), stores the claims with only their verified
 *   quotes, and logs the `research` card event with the queries, the pages, the verdicts and the cost, all in
 *   the transaction of the step that finished, so a restart leaves either the whole result or nothing. The
 *   readers build the engine-made view the later steps and the plan are shown (claim, verified quotes, refs,
 *   status, URL, title, time) and never any raw page text.
 *
 * Exports: storeResearchTx(), loadEvidenceViews(), evidenceInput(), countResearchRuns(), firstSourceNumber().
 * Depends on: @forge/core (checkClaims, evidence types), tick/planning-state, types/research-run. Writes inside the
 *   caller's transaction.
 */

import { checkClaims, evidenceViews } from '@forge/core';
import type {
  CardId,
  EvidenceOrigin,
  EvidenceView,
  SourceRef,
  StorageTx,
} from '@forge/core';
import { logPlanEvent } from '#/tick/planning-state.js';
import type { PlanCtx } from '#/types/card-planning.types.js';
import type { ResearchEnd } from '#/types/research-run.types.js';

const PAGE = 200;

/** The number part of the card's next free source ref. */
export async function firstSourceNumber(tx: StorageTx, cardId: CardId): Promise<number> {
  return Number((await tx.researchSources.nextRef(cardId)).slice(1));
}

/** How many research runs the card has had: each leaves one `research` event when it ends. */
export async function countResearchRuns(tx: StorageTx, cardId: CardId): Promise<number> {
  let runs = 0;
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(cardId, {
      ...(afterSeq === undefined ? {} : { afterSeq }),
      limit: PAGE,
    });

    runs += page.filter((e) => e.kind === 'research').length;
    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return runs;
    }

    afterSeq = last.seq;
  }
}

/**
 * Stores a finished run: its pages, its checked claims and the `research` event. Quotes are checked here,
 * against the page texts of this run and of the card's earlier sources; the claim's status comes only from
 * that check.
 */
export async function storeResearchTx(
  tx: StorageTx,
  pc: PlanCtx,
  end: ResearchEnd,
  origin: EvidenceOrigin,
  stepId: string,
  at: string,
): Promise<{ ref: string; status: 'verified' | 'unverified' }[]> {
  const cardId = pc.card.id;
  for (const s of end.state.sources) {
    await tx.researchSources.insert({
      project: pc.project.slug,
      card_id: cardId,
      ref: s.ref,
      origin: 'director',
      url: s.page.url,
      final_url: s.page.final_url,
      title: s.page.title,
      retrieved_at: s.page.retrieved_at,
      sha256: s.page.sha256,
      bytes: s.page.bytes,
      truncated: s.page.truncated,
      text: s.page.text,
    });
  }

  const claims = end.findings?.claims ?? [];
  const texts = new Map<string, string>(
    end.state.sources.map((s) => [s.ref, s.page.text]),
  );

  for (const ref of new Set(claims.flatMap((c) => c.quotes.map((q) => q.source)))) {
    if (!texts.has(ref)) {
      const earlier = await tx.researchSources.getByRef(cardId, ref);
      if (earlier) {
        texts.set(ref, earlier.text);
      }
    }
  }

  const checked = checkClaims(
    claims,
    [...texts].map(([ref, text]) => ({ ref, text })),
  );

  const rows = await tx.evidence.insertMany(
    cardId,
    checked.map((c) => ({
      step_id: stepId,
      origin,
      ...(c.claim.question === undefined ? {} : { question: c.claim.question }),
      claim: c.claim.text,
      quotes: c.quotes,
      sources: c.sources as SourceRef[],
      status: c.status,
      created_at: at,
    })),
  );

  const verdicts = rows.map((e) => ({ ref: e.ref, status: e.status }));
  await logPlanEvent(tx, cardId, at, {
    kind: 'research',
    payload: {
      step_id: stepId,
      origin,
      searches: end.state.searches,
      fetched: end.state.sources.map((s) => ({ ref: s.ref, url: s.page.url })),
      claims: verdicts,
      unanswered: end.findings?.unanswered ?? [...(end.open ?? [])],
      ...(end.note === undefined ? {} : { note: end.note }),
      cost_usd: end.cost,
    },
  });

  return verdicts;
}

/** The card's evidence with its sources, in ref order. */
export async function loadEvidenceViews(
  tx: StorageTx,
  cardId: CardId,
): Promise<EvidenceView[]> {
  const evidence = await tx.evidence.listByCard(cardId);

  return evidence.length === 0
    ? []
    : evidenceViews(evidence, await tx.researchSources.listByCard(cardId));
}

/**
 * The evidence as a step is shown it: the claim, its verified quotes, the refs, the status and where it came from.
 * Never page text beyond the quotes the engine verified.
 */
export function evidenceInput(views: readonly EvidenceView[]): Record<string, unknown>[] {
  return views.map((e) => ({
    ref: e.ref,
    claim: e.claim,
    status: e.status,
    ...(e.question === undefined ? {} : { question: e.question }),
    quotes: e.quotes,
    sources: e.source_list.map((s) => ({
      ref: s.ref,
      url: s.final_url,
      title: s.title,
      retrieved_at: s.retrieved_at,
    })),
  }));
}
