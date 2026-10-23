/**
 * Statement dedupe — drops near-duplicate risks and assumptions, keeping the first.
 *
 * Why: a plan's risks come from three writers (survey, verify, the planner) and the planner
 *   rephrases what the earlier steps already said, so exact-string merging left the owner
 *   reading the same risk four ways (11 entries for 3 or 4 real ones). Comparing normalised
 *   word sets catches those rephrasings while keeping every genuinely different statement,
 *   so the owner reads each risk once and a real one is never lost.
 *
 * Exports: DEDUPE_JACCARD, normaliseStatement(), dedupeStatements().
 * Depends on: nothing. No IO.
 */

/** Two statements whose word sets overlap at least this much (Jaccard) count as one. */
export const DEDUPE_JACCARD = 0.8;

const LABEL = /^\s*(?:risk|assumption)\s*:\s*/i;

/** The statement in comparable form: no label, lower case, punctuation and spacing collapsed. */
export function normaliseStatement(text: string): string {
  return text
    .replace(LABEL, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const word of a) {
    if (b.has(word)) {
      shared += 1;
    }
  }

  const union = a.size + b.size - shared;

  return union === 0 ? 1 : shared / union;
}

/** The statements in order with each near-duplicate of an earlier one dropped. */
export function dedupeStatements(statements: readonly string[]): string[] {
  const kept: { text: string; words: Set<string> }[] = [];
  for (const text of statements) {
    const words = new Set(normaliseStatement(text).split(' ').filter(Boolean));
    if (words.size === 0) {
      continue;
    }

    if (!kept.some((k) => jaccard(k.words, words) >= DEDUPE_JACCARD)) {
      kept.push({ text, words });
    }
  }

  return kept.map((k) => k.text);
}
