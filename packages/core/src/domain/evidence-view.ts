/**
 * Evidence view — a card's checked claims joined with the pages they were quoted from.
 *
 * Why: the owner's Evidence tab, the plan's verification section and the Director's later steps all show a
 *   claim together with where it came from (URL, title, retrieval time). The join is one pure function so the
 *   engine that writes the plan and the server that answers `GET /cards/:id/evidence` cannot disagree about it
 *   (d-0144). It never carries page text: only the metadata of the sources a claim names.
 *
 * Exports: evidenceViews().
 * Depends on: schemas/research. No IO.
 */

import type { Evidence, EvidenceView, ResearchSource } from '#/schemas/research.js';

/** Each evidence row with the sources it names, in the order the row lists them; unknown refs are dropped. */
export function evidenceViews(
  evidence: readonly Evidence[],
  sources: readonly ResearchSource[],
): EvidenceView[] {
  const byRef = new Map(
    sources.flatMap((s) => (s.ref === undefined ? [] : [[s.ref, s] as const])),
  );

  return evidence.map((e) => ({
    ...e,
    source_list: e.sources.flatMap((ref) => {
      const s = byRef.get(ref);

      return s
        ? [
            {
              ref,
              url: s.url,
              final_url: s.final_url,
              title: s.title,
              retrieved_at: s.retrieved_at,
            },
          ]
        : [];
    }),
  }));
}
