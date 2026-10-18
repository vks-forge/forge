/**
 * Shape of the server's research wiring.
 *
 * Why: the Director's research step and the settings page's Test button both need the provider the owner
 *   configured, and the owner can change it while the server runs. The wiring hands the engine one live
 *   provider that follows the saved settings, and the routes two operations: test a provider (the saved
 *   settings or unsaved ones) and refresh after a save. Naming the surface keeps the routes testable
 *   with a stub and the assembly honest about what it builds.
 *
 * Exports: ResearchWiring, ResearchRoutePort.
 * Depends on: @forge/core (ResearchProvider, ResearchSettings, ResearchTestReply). Types only.
 */

import type { ResearchProvider, ResearchSettings, ResearchTestReply } from '@forge/core';

/** What the routes may ask of the research wiring. */
export interface ResearchRoutePort {
  /** Checks a provider: the saved company settings, or `settings` when the owner tests unsaved values. */
  test(settings?: ResearchSettings): Promise<ResearchTestReply>;
  /** Rebuilds the live provider from the saved company settings; called after a save. */
  refresh(): Promise<void>;
}

/** The live provider for the engine plus the routes' port. */
export interface ResearchWiring extends ResearchRoutePort {
  readonly provider: ResearchProvider;
}
