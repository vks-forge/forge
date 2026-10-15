/**
 * A scripted polled trigger for the contract test.
 *
 * Why: no polled adapter exists yet (GitHub Issues comes after release), but the contract
 *   has a polled branch that must be exercised. This fake pulls events from a list, honours
 *   `since` inclusively like a real API would, and normalises a small raw shape.
 *
 * Exports: createFakePolledTrigger().
 * Depends on: @forge/core (IntakeEvent, TriggerAdapter). No IO.
 */

import { IntakeEvent } from '@forge/core';
import type { TriggerAdapter } from '@forge/core';

const IssueEvent = IntakeEvent.refine((event) => event.source === 'github_issue');

export function createFakePolledTrigger(
  pending: readonly IntakeEvent[] = [],
): TriggerAdapter {
  return {
    id: 'fake-polled',
    source: 'github_issue',
    capabilities: () => ({ push: false, poll: true }),
    normalise: (raw) => IssueEvent.parse(raw),
    poll: async (since) =>
      pending.filter((event) => since === null || event.received_at >= since),
  };
}
