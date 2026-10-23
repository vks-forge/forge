/**
 * Shapes of the owner glossary.
 *
 * Why: the glossary (domain/plain-words) and the "what's this" popover must agree on which terms
 *   exist, so the popover can only be asked about a term that has an explanation.
 *
 * Exports: TermId, Term.
 * Depends on: nothing. Types only.
 */

export type TermId =
  | 'check'
  | 'care'
  | 'risk'
  | 'attempt'
  | 'connector'
  | 'tool'
  | 'tool_session'
  | 'cache'
  | 'safety_minimum'
  | 'director';

export interface Term {
  readonly id: TermId;
  readonly label: string;
  readonly explain: string;
}
