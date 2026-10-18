/**
 * Scorecard input: the rows a scorecard is computed from, read in batches.
 *
 * Why: scorecards are computed on read and never stored (d-0081), so every reader (the owner's screens, the
 *   Director's plan step, its choice of a substitute) has to gather the same facts the same way: the
 *   project's tickets touched inside the window, their pipeline copies, stage rows, runs and the owner's
 *   marks on findings. On a large project that must stay cheap, so the window is at most 90 days, the tickets
 *   are capped at 2000 (newest first), and the rest is read 500 tickets at a time instead of one query per
 *   ticket. The arithmetic itself is core `computeScorecards`; this only brings it true rows.
 *
 * Exports: loadScorecardInput(), SCORECARD_TICKET_CAP.
 * Depends on: @forge/core (scorecard types). Reads inside the caller's transaction.
 */

import type {
  FindingMark,
  Run,
  RosterEntry,
  ScorecardInput,
  ScorecardRange,
  ScorecardTicket,
  StageRun,
  StorageTx,
  Ticket,
  TicketPipeline,
} from '@forge/core';

const DAY_MS = 86_400_000;
const PAGE = 200;
const BATCH = 500;

/** The most tickets one scorecard read looks at (the newest touched inside the window). */
export const SCORECARD_TICKET_CAP = 2000;

const RANGE_DAYS: Record<ScorecardRange, number> = { '30d': 30, '90d': 90 };

/** The project's tickets touched in the window, newest first, up to the cap. */
async function recentTickets(
  tx: StorageTx,
  project: string,
  sinceMs: number,
): Promise<Ticket[]> {
  const out: Ticket[] = [];
  let after: { updated_at: string; id: Ticket['id'] } | undefined;
  while (out.length < SCORECARD_TICKET_CAP) {
    const page = await tx.tickets.listByProject(project, {
      limit: PAGE,
      ...(after === undefined ? {} : { after }),
    });

    out.push(...page.filter((t) => Date.parse(t.updated_at) >= sinceMs));
    const last = page[page.length - 1];
    if (page.length < PAGE || !last || Date.parse(last.updated_at) < sinceMs) {
      break;
    }

    after = { updated_at: last.updated_at, id: last.id };
  }

  return out.slice(0, SCORECARD_TICKET_CAP);
}

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

/**
 * The input of `computeScorecards` for `project` (the project id the tickets carry): its recent tickets and
 * everything hanging off them, with `roster` naming the agents to report on.
 */
export async function loadScorecardInput(
  tx: StorageTx,
  args: {
    readonly project: string;
    readonly roster: readonly RosterEntry[];
    readonly now: number;
    readonly range: ScorecardRange;
  },
): Promise<ScorecardInput> {
  const tickets = await recentTickets(
    tx,
    args.project,
    args.now - RANGE_DAYS[args.range] * DAY_MS,
  );

  const snapshots: TicketPipeline[] = [];
  const rows: StageRun[] = [];
  const runs: Run[] = [];
  const marks: FindingMark[] = [];
  for (const ids of chunks(
    tickets.map((t) => t.id as string),
    BATCH,
  )) {
    snapshots.push(...(await tx.ticketPipelines.listByTickets(ids)));
    rows.push(...(await tx.stageRuns.listByTickets(ids)));
    runs.push(...(await tx.runs.listByTickets(ids)));
    marks.push(...(await tx.findingMarks.listByTickets(ids)));
  }

  const scored: ScorecardTicket[] = tickets;

  return {
    now: args.now,
    range: args.range,
    tickets: scored,
    snapshots,
    rows,
    runs,
    marks,
    roster: args.roster,
  };
}
