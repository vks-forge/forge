/**
 * Types for a loaded tool catalogue.
 *
 * Why: a catalogue either verifies or it does not, and downstream code must not be able
 *   to use a tool from one that did not. Making the unverified case a distinct variant
 *   with no tool map means a forgotten signature check is a type error rather than a
 *   silent allow (tool-system.md §4, §14).
 *
 * Exports: CatalogueState, QuarantineReason.
 * Depends on: schemas/tool-definition. No IO.
 */

import type { ToolDefinition } from '#/schemas/tool-definition.js';

export type QuarantineReason = 'malformed' | 'bad_signature';

/** Result of loading a catalogue: usable tools, or quarantined with nothing usable. */
export type CatalogueState =
  | {
      readonly status: 'verified';
      readonly tools: ReadonlyMap<string, ToolDefinition>;
      /** SHA-256 of the canonical entries; goes into the run record (catalogue is sealed per run). */
      readonly hash: string;
    }
  | { readonly status: 'quarantined'; readonly reason: QuarantineReason };
