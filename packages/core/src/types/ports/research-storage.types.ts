/**
 * Research storage port — fetched sources and checked evidence.
 *
 * Why: research results must outlive the tick that fetched them (the owner reads the evidence later,
 *   a restart must not duplicate it) and must be written in the same transaction as the card event and
 *   spend that describe them. Sources hold the stored page text the engine checks quotes against;
 *   evidence holds the checked claims. Refs (`S1`, `E1`) are numbered per card by storage alone and are
 *   unique per card, so a rerun after a restart cannot produce a second `S1`. Worker sources are rows
 *   without a card ref, tied to the run so `submit_review` can check a finding's cited URLs.
 *
 * Exports: NewResearchSource, NewEvidence, ResearchSourceRepository, EvidenceRepository.
 * Depends on: schemas/ids, schemas/research. Types only.
 */

import type { CardId } from '#/schemas/ids.js';
import type {
  Evidence,
  EvidenceOrigin,
  EvidenceQuote,
  EvidenceStatus,
  ResearchSource,
  SourceRef,
} from '#/schemas/research.js';

/** A source to store; `text` is cut to 100 000 characters by the repository, `sha256` covers the whole page. */
export type NewResearchSource = Omit<ResearchSource, 'id'> & { readonly text: string };

export interface NewEvidence {
  readonly step_id: string;
  readonly origin: EvidenceOrigin;
  readonly question?: string;
  readonly claim: string;
  readonly quotes: EvidenceQuote[];
  readonly sources: SourceRef[];
  readonly status: EvidenceStatus;
  readonly created_at: string;
}

export interface ResearchSourceRepository {
  // Stores the source (text capped, title capped to 300); throws InvalidInputError on a duplicate (card, ref).
  insert(source: NewResearchSource): Promise<ResearchSource>;
  // The next free `S<n>` for the card (1 + the highest used, 1 when none).
  nextRef(cardId: CardId): Promise<SourceRef>;
  // Every source of the card, in ref order.
  listByCard(cardId: CardId): Promise<ResearchSource[]>;
  // Every source a run recorded, oldest first.
  listByRun(runId: string): Promise<ResearchSource[]>;
  // The stored text of a source row, or null.
  text(id: number): Promise<string | null>;
  // One card source by ref with its text, or null.
  getByRef(
    cardId: CardId,
    ref: SourceRef,
  ): Promise<{ source: ResearchSource; text: string } | null>;
}

export interface EvidenceRepository {
  // Stores the rows with the next free `E<n>` refs, in order; returns them.
  insertMany(cardId: CardId, rows: readonly NewEvidence[]): Promise<Evidence[]>;
  // Every row of the card in ref order.
  listByCard(cardId: CardId): Promise<Evidence[]>;
  // Number of rows of the card, optionally of one origin.
  count(cardId: CardId, origin?: EvidenceOrigin): Promise<number>;
}
