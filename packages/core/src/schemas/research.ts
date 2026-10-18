/**
 * Research schemas — requests, results, findings, stored sources and evidence.
 *
 * Why: the Director sometimes needs facts from outside the repository (a library's limits, an API's
 *   behaviour) before it asks the owner or writes a plan. Pages and search snippets are written by
 *   strangers, so everything that crosses the boundary is a narrow typed shape: the research step can
 *   only ask for searches and fetches or report claims with quotes, never act. The engine fetches,
 *   stores each page as a numbered source and checks every quote against the stored text; a claim
 *   carries a status the model cannot set (d-0144, d-0001). The same shapes serve the owner's
 *   Evidence tab and the plan's verification section, so what the owner reads is what the engine
 *   checked.
 *
 * Exports: SourceRef, EvidenceRef, ResearchRequest, ResearchRequests, SearchHit, ResearchResult,
 *   EvidenceQuote, ResearchClaim, ResearchFindings, ResearchOutput, EVIDENCE_STATUSES, EvidenceStatus,
 *   EVIDENCE_ORIGINS, EvidenceOrigin, SOURCE_ORIGINS, SourceOrigin, ResearchSource, Evidence,
 *   EvidenceView, CardEvidenceReply, SourceTextReply, RunSourcesReply, MAX_SOURCE_TEXT_CHARS.
 * Depends on: schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { CardId, TicketId } from '#/schemas/ids.js';

/** Characters of page text the repository keeps per source (the sha256 covers the whole page). */
export const MAX_SOURCE_TEXT_CHARS = 100_000;

/** `S1`, `S2`, ... numbered per card. */
export const SourceRef = z.string().regex(/^S[1-9]\d*$/);
export type SourceRef = z.infer<typeof SourceRef>;

/** `E1`, `E2`, ... numbered per card. */
export const EvidenceRef = z.string().regex(/^E[1-9]\d*$/);
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const ResearchRequest = z.discriminatedUnion('op', [
  z.object({ op: z.literal('search'), query: z.string().trim().min(3).max(200) }),
  z.object({ op: z.literal('fetch'), url: z.url({ protocol: /^https?$/ }).max(2000) }),
]);
export type ResearchRequest = z.infer<typeof ResearchRequest>;

export const ResearchRequests = z.array(ResearchRequest).max(10);
export type ResearchRequests = z.infer<typeof ResearchRequests>;

export const SearchHit = z.object({
  title: z.string().max(300),
  url: z.string().min(1),
  snippet: z.string().max(300),
});
export type SearchHit = z.infer<typeof SearchHit>;

/** What one request returned to the step; `text` is already inside the untrusted envelope. */
export const ResearchResult = z.object({
  request: ResearchRequest,
  ok: z.boolean(),
  error: z.string().optional(),
  hits: z.array(SearchHit).optional(),
  source: SourceRef.optional(),
  text: z.string().max(14_000).optional(),
  truncated: z.boolean().optional(),
});
export type ResearchResult = z.infer<typeof ResearchResult>;

export const EvidenceQuote = z.object({
  source: SourceRef,
  quote: z.string().trim().min(20).max(300),
});
export type EvidenceQuote = z.infer<typeof EvidenceQuote>;

export const ResearchClaim = z.object({
  text: z.string().trim().min(10).max(500),
  quotes: z.array(EvidenceQuote).max(3),
  question: z.string().max(300).optional(),
});
export type ResearchClaim = z.infer<typeof ResearchClaim>;

export const ResearchFindings = z.object({
  summary: z.string().max(1000),
  claims: z.array(ResearchClaim).max(20),
  unanswered: z.array(z.string()).max(10),
  /** Sources whose text held instructions aimed at the reader; reported, never followed. */
  injection_seen: z.array(SourceRef).default([]),
});
export type ResearchFindings = z.infer<typeof ResearchFindings>;

/** `research` step output: more requests to run, or the findings; exactly one of them. */
export const ResearchOutput = z
  .object({
    research_requests: ResearchRequests.optional(),
    findings: ResearchFindings.optional(),
  })
  .refine((o) => (o.research_requests !== undefined) !== (o.findings !== undefined), {
    message: 'give research_requests or findings, not both and not neither',
  });
export type ResearchOutput = z.infer<typeof ResearchOutput>;

export const EVIDENCE_STATUSES = ['verified', 'unverified'] as const;
export const EvidenceStatus = z.enum(EVIDENCE_STATUSES);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

export const EVIDENCE_ORIGINS = ['research_step', 'grill_detour'] as const;
export const EvidenceOrigin = z.enum(EVIDENCE_ORIGINS);
export type EvidenceOrigin = z.infer<typeof EvidenceOrigin>;

export const SOURCE_ORIGINS = ['director', 'worker'] as const;
export const SourceOrigin = z.enum(SOURCE_ORIGINS);
export type SourceOrigin = z.infer<typeof SourceOrigin>;

/** A fetched page; the text is served separately (`SourceTextReply`). */
export const ResearchSource = z.object({
  id: z.number().int().positive(),
  project: z.string().min(1),
  card_id: CardId.optional(),
  ticket_id: TicketId.optional(),
  run_id: z.string().min(1).optional(),
  ref: SourceRef.optional(),
  origin: SourceOrigin,
  url: z.string().min(1),
  final_url: z.string().min(1),
  title: z.string().max(300),
  retrieved_at: z.iso.datetime(),
  sha256: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type ResearchSource = z.infer<typeof ResearchSource>;

/** One checked claim on a card. `quotes` are the verified ones only. */
export const Evidence = z.object({
  id: z.number().int().positive(),
  card_id: CardId,
  ref: EvidenceRef,
  step_id: z.string().min(1),
  origin: EvidenceOrigin,
  question: z.string().max(300).optional(),
  claim: z.string().min(1).max(500),
  quotes: z.array(EvidenceQuote),
  sources: z.array(SourceRef),
  status: EvidenceStatus,
  created_at: z.iso.datetime(),
});
export type Evidence = z.infer<typeof Evidence>;

export const EvidenceView = Evidence.extend({
  source_list: z.array(
    z.object({
      ref: SourceRef,
      url: z.string(),
      final_url: z.string(),
      title: z.string(),
      retrieved_at: z.iso.datetime(),
    }),
  ),
});
export type EvidenceView = z.infer<typeof EvidenceView>;

/** `GET /cards/:id/evidence`. */
export const CardEvidenceReply = z.object({
  evidence: z.array(EvidenceView),
  sources: z.array(ResearchSource),
  runs_used: z.number().int().nonnegative(),
  runs_cap: z.number().int().positive(),
});
export type CardEvidenceReply = z.infer<typeof CardEvidenceReply>;

/** `GET /cards/:id/sources/:ref`: the stored text, to be shown as plain text only. */
export const SourceTextReply = z.object({ source: ResearchSource, text: z.string() });
export type SourceTextReply = z.infer<typeof SourceTextReply>;

/** `GET /runs/:id/sources`. */
export const RunSourcesReply = z.object({ sources: z.array(ResearchSource) });
export type RunSourcesReply = z.infer<typeof RunSourcesReply>;
