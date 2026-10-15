/**
 * What the mock adapter hands to each resource's fixture module.
 *
 * Why: every mocked resource waits a realistic delay and can be told to answer empty or fail,
 *   so each fixture module gets the same two levers instead of re-reading the options. The
 *   archived set lets archiving a project in one resource show up in the project list of
 *   another within the same session.
 *
 * Exports: MockContext.
 * Depends on: types/api.types. Types only.
 */

import type { MockScenario } from '#/types/api.types.js';

export interface MockContext {
  readonly scenario: MockScenario;
  /** Resolves after the simulated latency; rejects with an AbortError when the signal fires. */
  readonly delay: (signal?: AbortSignal) => Promise<void>;
  /** Slugs archived during this session. */
  readonly archived: Set<string>;
}
