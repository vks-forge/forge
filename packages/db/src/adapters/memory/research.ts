/**
 * In-memory research source and evidence repositories.
 *
 * Why: engine and server tests run on this backend, so the guarantees of SQLite must hold here: a card's
 *   source refs and evidence refs are numbered by storage and unique per card, a duplicate (card, ref)
 *   throws, page text is capped in one place and titles are cut, a Worker's sources are found by run, and
 *   every value is parsed with the core schemas and read back as a copy. State lives in `MemoryState`, so a
 *   rolled-back transaction leaves no source or evidence behind.
 *
 * Exports: memoryResearchSources(), memoryEvidence().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import {
  Evidence,
  InvalidInputError,
  MAX_SOURCE_TEXT_CHARS,
  ResearchSource,
} from '@forge/core';
import type { EvidenceRepository, ResearchSourceRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

const MAX_TITLE = 300;
const num = (ref: string | undefined): number => Number(ref?.slice(1) ?? 0);

const strip = (s: ResearchSource & { text: string }): ResearchSource => {
  const { text: _text, ...source } = s;
  void _text;

  return structuredClone(source);
};

export function memoryResearchSources(state: MemoryState): ResearchSourceRepository {
  const forCard = (cardId: string) =>
    state.researchSources
      .filter((s) => s.card_id === cardId)
      .sort((a, b) => num(a.ref) - num(b.ref));

  return {
    async insert(source) {
      const text = source.text.slice(0, MAX_SOURCE_TEXT_CHARS);
      const row = ResearchSource.omit({ id: true }).parse({
        ...source,
        title: source.title.slice(0, MAX_TITLE),
        truncated: source.truncated || text.length < source.text.length,
        text: undefined,
      });

      if (
        row.card_id !== undefined &&
        row.ref !== undefined &&
        state.researchSources.some((s) => s.card_id === row.card_id && s.ref === row.ref)
      ) {
        throw new InvalidInputError(
          `constraint violated: source ${row.ref} already exists on card ${row.card_id}`,
        );
      }

      state.researchSourceSeq += 1;
      const stored = { ...row, id: state.researchSourceSeq, text };
      state.researchSources.push(structuredClone(stored));

      return strip(stored);
    },

    async nextRef(cardId) {
      return `S${Math.max(0, ...forCard(cardId).map((s) => num(s.ref))) + 1}`;
    },

    async listByCard(cardId) {
      return forCard(cardId).map(strip);
    },

    async listByRun(runId) {
      return state.researchSources
        .filter((s) => s.run_id === runId)
        .sort((a, b) => a.id - b.id)
        .map(strip);
    },

    async text(id) {
      return state.researchSources.find((s) => s.id === id)?.text ?? null;
    },

    async getByRef(cardId, ref) {
      const found = state.researchSources.find(
        (s) => s.card_id === cardId && s.ref === ref,
      );

      return found ? { source: strip(found), text: found.text } : null;
    },
  };
}

export function memoryEvidence(state: MemoryState): EvidenceRepository {
  const forCard = (cardId: string) =>
    state.evidence
      .filter((e) => e.card_id === cardId)
      .sort((a, b) => num(a.ref) - num(b.ref));

  return {
    async insertMany(cardId, rows) {
      let next = Math.max(0, ...forCard(cardId).map((e) => num(e.ref)));
      const written = rows.map((r) => {
        next += 1;
        state.evidenceSeq += 1;
        const stored = Evidence.parse({
          ...r,
          card_id: cardId,
          ref: `E${next}`,
          id: state.evidenceSeq,
        });

        state.evidence.push(structuredClone(stored));

        return structuredClone(stored);
      });

      return written;
    },

    async listByCard(cardId) {
      return structuredClone(forCard(cardId));
    },

    async count(cardId, origin) {
      return forCard(cardId).filter((e) => origin === undefined || e.origin === origin)
        .length;
    },
  };
}
