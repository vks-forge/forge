/**
 * Pins which runs of a ticket back a rework run's claims.
 *
 * Why: a rework run that only repairs its `finish` claims has no edit receipts of its own;
 * G1 must look at the ticket's earlier runs, and only at those, or an unrelated ticket's
 * receipts (or a later run's) could vouch for a claim.
 *
 * Pins: createStorageEarlierRuns() returns same-ticket runs that started before, oldest first.
 * Depends on: adapters/storage-earlier-runs, vitest. No IO.
 */

import type { Run, StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createStorageEarlierRuns } from '#/adapters/storage-earlier-runs.js';

const run = (id: string, started_at: string, ticket_id = 'FX-1'): Run =>
  ({ id, ticket_id, started_at }) as Run;

function storageWith(runs: Run[]): StorageAdapter {
  return {
    transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          runs: {
            listByTicket: (t: string) =>
              Promise.resolve(runs.filter((r) => r.ticket_id === t)),
          },
        }),
      ),
  } as unknown as StorageAdapter;
}

describe('createStorageEarlierRuns', () => {
  it("returns the ticket's earlier runs oldest first, never itself, later runs or other tickets", async () => {
    const current = run('r3', '2026-01-01T00:03:00.000Z');
    const earlier = createStorageEarlierRuns(
      storageWith([
        run('r2', '2026-01-01T00:02:00.000Z'),
        run('r1', '2026-01-01T00:01:00.000Z'),
        current,
        run('r4', '2026-01-01T00:04:00.000Z'),
        run('other', '2026-01-01T00:00:30.000Z', 'FX-2'),
      ]),
    );

    expect(await earlier(current)).toEqual(['r1', 'r2']);
  });
});
