/**
 * Types of the evidence check.
 *
 * Why: the engine checks a research model's claims against the stored text of the pages it named
 *   (d-0144, d-0001). The inputs and the verdict are plain shapes the pure check and its callers share.
 *
 * Exports: SourceText, CheckedClaim.
 * Depends on: schemas/research. Types only.
 */

import type { EvidenceQuote, EvidenceStatus, ResearchClaim } from '#/schemas/research.js';

/** A stored source's reference and full page text. */
export interface SourceText {
  readonly ref: string;
  readonly text: string;
}

/** A claim with its verified quotes, the sources they sit in and the engine's verdict. */
export interface CheckedClaim {
  readonly claim: Pick<ResearchClaim, 'text' | 'question'>;
  /** The quotes that matched their source; empty when none did. */
  readonly quotes: EvidenceQuote[];
  /** Distinct sources of the verified quotes; for an unverified claim, the known sources it named. */
  readonly sources: string[];
  readonly status: EvidenceStatus;
}
