/**
 * Small UI-only shapes shared by the settings components.
 *
 * Why: several settings components pass the same status tone; naming it once keeps their
 *   props consistent and the colours' meaning (amber needs you, red broken) in one place.
 *
 * Exports: PillTone, AskedDecision.
 * Depends on: nothing. Types only.
 */

export type PillTone = 'good' | 'attn' | 'bad' | 'quiet';

/** A tool decision waiting for the owner's confirmation. */
export interface AskedDecision {
  readonly tool: string;
  readonly decision: 'approve' | 'deny';
}
