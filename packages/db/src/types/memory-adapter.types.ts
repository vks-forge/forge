/**
 * Types shared inside the memory adapters: what the full-text writer indexes and what the naive scorer parses.
 *
 * Why: the SQLite index writer and the in-memory scorer each take a small bag of values that is not a
 *   public port. Declaring them here keeps the adapter files free of declarations and says plainly what
 *   each helper needs, so a change to the stored row cannot silently skip a column the index reads.
 *
 * Exports: FtsRecord, NaiveTerm.
 * Depends on: nothing. Types only.
 */

/** The columns of a record the full-text index holds (tags are passed beside it). */
export interface FtsRecord {
  readonly project: string;
  readonly id: string;
  readonly statement: string;
  readonly gist: string | null;
  readonly aliases: readonly string[];
  readonly body: string;
}

/** One quoted term of a match expression: its words and whether the last word is a prefix. */
export interface NaiveTerm {
  readonly words: string[];
  readonly prefix: boolean;
}
