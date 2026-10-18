/**
 * Types of the effective research settings.
 *
 * Why: what research may use for one project is the company's settings narrowed by the project's (d-0144);
 *   the provider factory, the engine and the Worker tools all read this one answer.
 *
 * Exports: EffectiveResearch.
 * Depends on: schemas/research-settings. Types only.
 */

import type { ResearchSettings } from '#/schemas/research-settings.js';

/** What the provider factory and the admission path use for one project. */
export interface EffectiveResearch {
  readonly enabled: boolean;
  readonly provider: ResearchSettings['provider'];
  /** Empty means no restriction beyond the network floor. */
  readonly allowHosts: string[];
  readonly denyHosts: string[];
}
