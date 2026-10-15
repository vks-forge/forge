/**
 * Types for a loaded tool catalogue.
 *
 * Why: a catalogue either loads or it does not, and downstream code must not be able to
 *   use a tool from one that did not. Making the unusable case a distinct variant with no
 *   tool map means a forgotten check is a type error rather than a silent allow
 *   (tool-system.md §4, §14).
 *
 * Exports: CatalogueState, QuarantineReason, NativeSchemaRow, NativeSchemaStatus,
 *   EffectiveCatalogue.
 * Depends on: schemas/tool-definition. No IO.
 */

import type { ToolDefinition } from '#/schemas/tool-definition.js';

export type QuarantineReason = 'malformed';

/** Result of loading a catalogue: usable tools, or quarantined with nothing usable. */
export type CatalogueState =
  | {
      readonly status: 'verified';
      readonly tools: ReadonlyMap<string, ToolDefinition>;
      /** SHA-256 of the canonical entries; goes into the run record (catalogue is sealed per run). */
      readonly hash: string;
    }
  | { readonly status: 'quarantined'; readonly reason: QuarantineReason };

/** Whether the installed harness build's schema for a native tool was approved. */
export type NativeSchemaStatus = 'approved' | 'pending' | 'denied';

/** One row of the per-build native tool schema table, as far as policy needs it. */
export interface NativeSchemaRow {
  /** Catalogue id of the tool (`read`, `shell`, ...). */
  readonly tool: string;
  readonly schema_hash: string;
  readonly status: NativeSchemaStatus;
}

/** A catalogue with the installed harness build's native schemas applied. */
export interface EffectiveCatalogue {
  readonly catalogue: CatalogueState;
  /** Live schema hash per tool the harness reports; what `admit()` compares to the entry. */
  readonly liveSchemaHashes: Readonly<Record<string, string>>;
  /** Native tools whose schema is not approved for this build, with why. */
  readonly schemaStatus: Readonly<Record<string, 'pending' | 'denied'>>;
}
