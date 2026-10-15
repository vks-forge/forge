/**
 * A scripted polled trigger for the registry and poller tests.
 *
 * Why: no real polled adapter exists yet (GitHub Issues comes after release), but the server's
 *   polling loop must be exercised. This fake serves a mutable list, honours `since`
 *   inclusively like a real API, and can be told to fail.
 *
 * Exports: fakePolledTrigger(), issueEvent().
 * Depends on: @forge/core (IntakeEvent, TriggerAdapter). No IO.
 */

import type { IntakeEvent, TriggerAdapter } from '@forge/core';

export function issueEvent(key: string, at: string): IntakeEvent {
  return {
    source: 'github_issue',
    kind: 'new_request',
    dedupe_key: key,
    actor: { type: 'external', id: 'octocat' },
    author: { kind: 'github', login: 'octocat' },
    project: 'fixture',
    payload: { text: `issue ${key}` },
    received_at: at,
  };
}

export interface FakePolled extends TriggerAdapter {
  /** What the next polls return. */
  pending: IntakeEvent[];
  /** The `since` argument of every call, in order. */
  readonly calls: (string | null)[];
  /** When set, the next poll rejects with it. */
  failNext: Error | null;
}

export function fakePolledTrigger(id = 'fake-polled'): FakePolled {
  const fake: FakePolled = {
    id,
    source: 'github_issue',
    pending: [],
    calls: [],
    failNext: null,
    capabilities: () => ({ push: false, poll: true }),
    normalise: (raw) => raw as IntakeEvent,
    poll: async (since) => {
      fake.calls.push(since);
      if (fake.failNext) {
        const error = fake.failNext;
        fake.failNext = null;

        throw error;
      }

      return fake.pending.filter((e) => since === null || e.received_at >= since);
    },
  };

  return fake;
}
