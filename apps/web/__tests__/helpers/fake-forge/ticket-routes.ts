/**
 * Stub routes for tickets: the project's ticket list, one ticket's detail, answering a question,
 * chat intake and the stream ticket.
 *
 * Why: the Board and Ticket page must show their loading, empty, error and live states without
 *   a Forge server. These routes keep a small mutable store so the sample world behaves like
 *   the real one: answering a question clears it and wakes the ticket, a chat request
 *   creates an inbox ticket the Board then shows, a second answer to the same question is
 *   refused with 409, an unknown id is 404, a repeated dedupe key is a duplicate. The shapes
 *   match `apps/server/src/routes/tickets.ts`, `ticket-list.ts`, `interactions.ts` and
 *   `intake.ts`. The run streams themselves are scripted in `event-source-stub.ts`.
 *
 * Exports: ticketRoutes().
 * Depends on: @forge/core (NEEDS_YOU_STATUSES, types), helpers/fetch-stub,
 *   helpers/forge-data/ticket-*.
 */

import {
  NEEDS_YOU_STATUSES,
  canCancelTicket,
  openBlockerIds,
  openDependentIds,
  ticketNeedsYouItems,
} from '@forge/core';
import type { Run, Ticket, TicketSummary } from '@forge/core';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { buildSampleTickets } from '#tests/helpers/forge-data/ticket-fixtures.js';
import type { SampleTicket } from '#tests/helpers/forge-data/ticket-data.types.js';

const PROJECTS: Readonly<Record<string, { id: string; prefix: string }>> = {
  'sample-service': { id: 'fixture-1', prefix: 'SVC' },
  'sample-web': { id: 'fixture-2', prefix: 'WEB' },
};

const DEFAULT_PAGE = 100;

function summarize(item: SampleTicket, slug: string): TicketSummary {
  const { ticket } = item;
  const run = item.runs.find((r) => r.id === ticket.assignee_run_id);

  return {
    id: ticket.id,
    title: ticket.title,
    state: ticket.status,
    lane: ticket.lane,
    type: ticket.type,
    tier_predicted: ticket.tier_predicted,
    project: slug,
    ...(ticket.card_id ? { card_id: ticket.card_id } : {}),
    priority: ticket.priority,
    rework_count: ticket.rework_count,
    needs_you: NEEDS_YOU_STATUSES.includes(ticket.status),
    ...(ticket.blocked_reason ? { blocked_reason: ticket.blocked_reason } : {}),
    ...(ticket.assignee_run_id ? { run_id: ticket.assignee_run_id } : {}),
    ...(run ? { run_status: run.status } : {}),
    ...(ticket.pr_url ? { pr_url: ticket.pr_url } : {}),
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
  };
}

/** The server's `cost` for a ticket: recorded dollars per run (oldest first) and their sum. */
function ticketCost(runs: readonly Run[]) {
  const by_run = [...runs]
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((run) => ({
      run_id: run.id,
      usd: run.cost_usd ?? 0,
      status: run.status,
      started_at: run.started_at,
      recorded: run.cost_usd !== undefined,
    }));

  const workers_usd = by_run.reduce((sum, run) => sum + run.usd, 0);

  // The real server also sends the Director's own spend on the ticket (a ledger sum, 0 here).
  return { total_usd: workers_usd, workers_usd, director_usd: 0, by_run };
}

export function ticketRoutes(options: { empty: boolean }): Routes {
  const store = new Map<string, SampleTicket>(
    buildSampleTickets().map((item) => [item.ticket.id, item]),
  );

  const seenKeys = new Set<string>();
  const answered = new Set<string>();
  let streamTickets = 0;
  const slugOfProject = (id: string): string | undefined =>
    Object.entries(PROJECTS).find(([, p]) => p.id === id)?.[0];

  const touch = (id: string, change: Partial<Ticket>): void => {
    const item = store.get(id);
    if (item) {
      store.set(id, {
        ...item,
        ticket: { ...item.ticket, ...change, updated_at: new Date().toISOString() },
      });
    }
  };

  return {
    'GET /projects/:slug/tickets': ({ params, query }) => {
      const slug = params['slug']!;
      const project = PROJECTS[slug];
      if (!project) {
        return refusal(404, 'project_not_found', `No project ${slug}.`);
      }

      const states = query.get('state')?.split(',');
      const all = options.empty
        ? []
        : [...store.values()]
            .filter((item) => item.ticket.project === project.id)
            .filter((item) => !states || states.includes(item.ticket.status))
            .sort(
              (a, b) =>
                b.ticket.updated_at.localeCompare(a.ticket.updated_at) ||
                a.ticket.id.localeCompare(b.ticket.id),
            );

      const start = Number(query.get('cursor') ?? 0);
      const end = start + Number(query.get('limit') ?? DEFAULT_PAGE);

      return json({
        items: all.slice(start, end).map((item) => summarize(item, slug)),
        nextCursor: end < all.length ? String(end) : null,
      });
    },

    'GET /tickets/:id': ({ params }) => {
      const item = store.get(params['id']!);
      if (!item || options.empty) {
        return refusal(404, 'not_found', `No ticket ${params['id']}.`);
      }

      // What the server offers for finished work: approve (or sign off), send back, cancel.
      const finished =
        item.ticket.status === 'review' || item.ticket.status === 'needs_signoff';

      const waitActions = finished ? ['approve', 'rework', 'cancel'] : [];

      return json({
        ticket: item.ticket,
        runs: [...item.runs],
        gate_results: [...item.gates],
        interactions: item.interactions.filter(
          (i) => i.status === 'pending' && !answered.has(i.id),
        ),
        wait_reason: item.waitReason,
        escalations: [],
        wait_actions: waitActions,
        needs_you_detail: ticketNeedsYouItems({
          ticket: item.ticket,
          escalations: [],
          waitActions: waitActions as never,
        }),
        cost: ticketCost(item.runs),
        // The server's own derivations (core's shared rules), so the page sees what the real one would.
        can_cancel: canCancelTicket(item.ticket, null),
        dependents: openDependentIds(
          [...store.values()]
            .map((other) => other.ticket)
            .filter((t) => t.status !== 'done' && t.status !== 'cancelled'),
          item.ticket.id,
        ),
        open_blockers: openBlockerIds(item.ticket, (id) => store.get(id)?.ticket.status),
      });
    },

    'POST /interactions/:id/answer': ({ params }) => {
      const id = params['id']!;
      const owner = [...store.values()].find((item) =>
        item.interactions.some((i) => i.id === id),
      );

      if (!owner) {
        return refusal(404, 'not_found', `No interaction ${id}.`);
      }

      if (answered.has(id)) {
        return refusal(409, 'not_pending', `interaction ${id} is not pending`);
      }

      answered.add(id);
      touch(owner.ticket.id, { status: 'in_progress' });

      return json({ id, status: 'answered' });
    },

    'POST /auth/sse-ticket': () => {
      streamTickets += 1;

      return json({ ticket: `ticket-${streamTickets}`, expires_in_s: 60 });
    },

    'POST /intake': ({ body }) => {
      const input = body as {
        dedupe_key: string;
        project: string;
        payload: { text: string };
      };

      const slug = slugOfProject(input.project);
      const project = slug ? PROJECTS[slug] : undefined;
      if (!slug || !project) {
        return {
          status: 202,
          body: { status: 'ignored', reason: `unknown project ${input.project}` },
        };
      }

      if (seenKeys.has(input.dedupe_key)) {
        return { status: 202, body: { status: 'duplicate' } };
      }

      seenKeys.add(input.dedupe_key);
      const numbers = [...store.keys()]
        .filter((id) => id.startsWith(`${project.prefix}-`))
        .map((id) => Number(id.slice(project.prefix.length + 1)));

      const id = `${project.prefix}-${Math.max(0, ...numbers) + 1}` as Ticket['id'];
      const now = new Date().toISOString();
      const base = [...store.values()][0]?.ticket;
      if (!base) {
        return { status: 202, body: { status: 'ignored', reason: 'no sample data' } };
      }

      store.set(id, {
        ticket: {
          ...base,
          id,
          project: project.id,
          title: input.payload.text.slice(0, 80),
          body: input.payload.text,
          status: 'inbox',
          lane: 'express',
          tier_predicted: 'A',
          rework_count: 0,
          blocked_reason: undefined,
          assignee_run_id: undefined,
          pr_number: undefined,
          pr_url: undefined,
          blocked_by: [],
          created_at: now,
          updated_at: now,
        },
        runs: [],
        gates: [],
        interactions: [],
        waitReason: null,
      });

      return { status: 202, body: { status: 'ticket_created', ticketId: id } };
    },
  };
}
