/**
 * StorageAdapter contract: one suite every storage backend must pass.
 *
 * Why: the Director must behave identically on any backend, so this suite is the
 *   executable definition of StorageAdapter and every backend must pass it. It pins the
 *   properties engine correctness rests on: a stale writer must lose the CAS race (or
 *   two Director ticks could double-dispatch a ticket), a throw rolls back every write
 *   in the transaction (or a ticket could move without its run row), concurrent
 *   transactions serialize, intake duplicates are dropped per source, run events are
 *   numbered by storage alone (two writers on one run, the driver and the MCP server,
 *   can never collide or leave a gap), run tokens exist only as revocable hashes (a
 *   leaked database file must not yield a usable credential), and only pending
 *   interactions are listed (director-core.md §3, §7, §8).
 *
 * Each repository's cases live in their own file and are registered from here, so every
 *   backend runs them: tickets, transactions, runs, run events, run tokens, ticket
 *   relations and the ticket fields derived from them, the run lifecycle, interaction answer/expire CAS, intake ids and ticket mapping, wake requests,
 *   the run inbox, gate results and projects (ports batch C), the harness registry.
 *
 * Also pinned: optional columns can be cleared (a patch from `transition()` leaves no stale
 *   `blocked_reason` / `tier_actual`), the CAS owns `status_version`, a transaction
 *   callback that re-enters the adapter fails fast instead of deadlocking, backend
 *   failures surface as typed ForgeErrors, and a revoked run token cannot be re-armed by
 *   `issue`.
 *
 * Exports: describeStorageContract().
 * Depends on: vitest, @forge/core, helpers/fixtures, the sibling *.contract files. IO only
 *   through the adapter under test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@forge/core';
import { makeInteraction } from '#tests/helpers/fixtures.js';
import { describeRunEventsContract } from './run-events.contract.js';
import { describeRunTokensContract } from './run-tokens.contract.js';
import { describeRunsContract } from './runs.contract.js';
import { describeTicketsContract } from './tickets.contract.js';
import { describeTransactionsContract } from './transactions.contract.js';
import { describeInteractionCasContract } from './interaction-cas.contract.js';
import { describeIntakeEventsContract } from './intake-events.contract.js';
import { describeRunLifecycleContract } from './run-lifecycle.contract.js';
import { describeTicketRelationsContract } from './ticket-relations.contract.js';
import { describeWakeRequestsContract } from './wake-requests.contract.js';
import { describeHarnessesContract } from './harnesses.contract.js';
import { describeWorkQueuesContract } from './work-queues.contract.js';

/** Register the shared contract; `makeAdapter` must return a fresh, empty adapter each call. */
export function describeStorageContract(
  name: string,
  makeAdapter: () => Promise<StorageAdapter> | StorageAdapter,
): void {
  describe(`StorageAdapter contract: ${name}`, () => {
    let db: StorageAdapter;
    beforeEach(async () => {
      db = await makeAdapter();
    });

    afterEach(async () => {
      await db.close();
    });

    describeTicketRelationsContract(() => db);
    describeRunLifecycleContract(() => db);
    describeInteractionCasContract(() => db);
    describeIntakeEventsContract(() => db);
    describeWakeRequestsContract(() => db);
    describeWorkQueuesContract(() => db);
    describeHarnessesContract(() => db);
    describeTicketsContract(() => db);
    describeTransactionsContract(() => db);
    describeRunsContract(() => db);
    describeRunEventsContract(() => db);
    describeRunTokensContract(() => db);

    describe('interactions', () => {
      it('lists only pending interactions, oldest first, and drops answered ones', async () => {
        await db.transaction(async (tx) => {
          await tx.interactions.insert(
            makeInteraction('i2', { asked_at: '2026-10-13T02:00:00.000Z' }),
          );

          await tx.interactions.insert(makeInteraction('i1'));
          await tx.interactions.insert(makeInteraction('i3', { status: 'cancelled' }));
        });

        const pending = await db.transaction((tx) => tx.interactions.listPending());
        expect(pending.map((i) => i.id)).toEqual(['i1', 'i2']);

        await db.transaction((tx) =>
          tx.interactions.update('i1', {
            status: 'answered',
            answer: { choice: 'sqlite' },
            answered_at: '2026-10-13T03:00:00.000Z',
          }),
        );

        const after = await db.transaction((tx) => tx.interactions.listPending());
        const i1 = await db.transaction((tx) => tx.interactions.get('i1'));
        expect(after.map((i) => i.id)).toEqual(['i2']);
        expect(i1).toMatchObject({ status: 'answered', answer: { choice: 'sqlite' } });
      });

      it('returns null for an unknown interaction', async () => {
        const got = await db.transaction((tx) => tx.interactions.get('nope'));
        expect(got).toBeNull();
      });
    });
  });
}
