/**
 * Reads one project's rows into the shape the Overview sums.
 *
 * Why: the Overview adds up every project's tickets, runs, Director spend rows, G1 verdicts, open cards and
 *   waiting inbox items, and each of those lives behind a different storage call. This reads
 *   them for one project in one transaction (walking pages, so nothing loads unbounded), and
 *   leaves every rule about what they mean to core's `computeOverviewStats`. Inbox items come
 *   from the same derivation as the Inbox screen, with the owner's marks applied, so the
 *   count of "waiting on you" here is the count the sidebar shows.
 *
 * Exports: readOverviewProject().
 * Depends on: @forge/core (inbox rules, StorageTx), services/collect-pages,
 *   services/inbox-source. IO: reads storage.
 */

import { applyInboxMarks, inInboxView } from '@forge/core';
import type {
  BudgetDefault,
  Card,
  GateResult,
  MemoryListEntry,
  OverviewProjectInput,
  Project,
  StorageTx,
} from '@forge/core';
import { collectRuns, collectTickets } from '#/services/collect-pages.js';
import { gatherInboxCandidates } from '#/services/inbox-source.js';

const PAGE = 500;
const CLOSED_PHASES: ReadonlySet<Card['phase']> = new Set(['done', 'closed']);

async function countOpenCards(tx: StorageTx, project: string): Promise<number> {
  let open = 0;
  let after: { updated_at: string; id: string } | undefined;

  for (;;) {
    const page = await tx.cards.listByProject(project, {
      limit: PAGE,
      ...(after ? { after } : {}),
    });

    open += page.filter((c) => !CLOSED_PHASES.has(c.phase)).length;

    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return open;
    }

    after = { updated_at: last.updated_at, id: last.id };
  }
}

/** `since` is the earliest run start to read (undefined reads every run). */
export async function readOverviewProject(
  tx: StorageTx,
  project: Project,
  since: string | undefined,
  proposals: readonly MemoryListEntry[],
  nowMs: number,
  installedVersion: (kind: string) => string | null,
  budgetDefault: BudgetDefault,
): Promise<OverviewProjectInput> {
  const runs = await collectRuns(tx, {
    project: project.id,
    ...(since === undefined ? {} : { since }),
  });

  const active = await collectRuns(tx, {
    project: project.id,
    statuses: ['starting', 'running'],
  });

  const gates: GateResult[] = [];
  for (const ticketId of new Set(runs.map((r) => r.ticket_id))) {
    gates.push(...(await tx.gateResults.listByTicket(ticketId)));
  }

  const candidates = await gatherInboxCandidates(
    tx,
    project,
    proposals,
    nowMs,
    installedVersion,
    budgetDefault,
  );

  const marks = await tx.inboxStates.listByProject(project.id);

  return {
    slug: project.slug,
    status: project.status,
    tickets: await collectTickets(tx, project.id),
    runs,
    directorSpend: await tx.directorSpend.listByProject(project.id, {
      ...(since === undefined ? {} : { from: since }),
    }),
    gates,
    activeRuns: active.length,
    openCards: await countOpenCards(tx, project.id),
    needsAction: applyInboxMarks(candidates, marks).filter((i) =>
      inInboxView(i, 'needs_action'),
    ),
  };
}
