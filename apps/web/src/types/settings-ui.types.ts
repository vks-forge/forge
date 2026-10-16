/**
 * Small UI-only shapes shared by the settings components.
 *
 * Why: several settings components pass the same status tone; naming it once keeps their
 *   props consistent and the colours' meaning (amber needs you, red broken) in one place.
 *
 * Exports: PillTone, AskedDecision, Crumb, HeroFact, HeroTab, HeroBadge.
 * Depends on: nothing. Types only.
 */

export type PillTone = 'good' | 'attn' | 'bad' | 'quiet';

/** One step of the breadcrumb above a settings page title. */
export interface Crumb {
  readonly label: string;
  readonly to?: string;
}

/** One key fact in the strip under a page title; `value` is "—" when the API does not know it. */
export interface HeroFact {
  readonly label: string;
  readonly value: string;
  /** Data (versions, paths) is set in the mono face. */
  readonly mono?: boolean;
}

/** One in-page tab; `id` is the section's element id and the URL hash. */
export interface HeroTab {
  readonly id: string;
  readonly label: string;
}

/** The status badge beside a page title. */
export interface HeroBadge {
  readonly tone: PillTone;
  readonly label: string;
}

/** A tool decision waiting for the owner's confirmation. */
export interface AskedDecision {
  readonly tool: string;
  readonly decision: 'approve' | 'deny';
}
