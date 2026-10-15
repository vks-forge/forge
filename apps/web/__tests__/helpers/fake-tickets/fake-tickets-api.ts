/**
 * Test-only fake of the ticket side of the Forge server: list, detail, answer, chat intake and a scripted run stream.
 *
 * Why: the Board and Ticket page must show their loading, empty, error and live states
 *   without a Forge server. This keeps a small mutable store so
 *   the fixture world behaves like the real one: answering a question clears it and wakes the
 *   ticket, a chat request creates an inbox ticket the Board then shows, a second answer to
 *   the same question is refused with 409, an unknown id is 404, a repeated dedupe key is a
 *   duplicate. A run's stream replays its script one event per tick (instantly when latency
 *   is zero, so tests need no clock) and a run whose script has no ending stays open, like a
 *   Worker still working.
 *
 * Exports: createFakeTickets().
 * Depends on: @forge/core (types, NEEDS_YOU_STATUSES), api/api-error, fake-tickets/fixtures and scripts,
 *   types/api.types.
 */

import { NEEDS_YOU_STATUSES } from '@forge/core';
import type { RunEvent, Ticket, TicketSummary } from '@forge/core';
import { ApiError } from '#/api/api-error.js';
import { streamScripts } from '#tests/helpers/fake-tickets/scripts.js';
import { buildSampleTickets } from '#tests/helpers/fake-tickets/fixtures.js';
import type { ForgeApiAdapter } from '#/types/api.types.js';
import type { FakeTicketHooks, SampleTicket } from '#tests/helpers/fake-tickets/types.js';

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

function notFound(what: string): ApiError {
  return new ApiError('http', `No ${what}.`, { status: 404, code: 'not_found' });
}

export function createFakeTickets(
  hooks: FakeTicketHooks,
): Pick<ForgeApiAdapter, 'tickets' | 'interactions' | 'runEvents' | 'intake'> {
  const store = new Map<string, SampleTicket>(
    buildSampleTickets().map((item) => [item.ticket.id, item]),
  );

  const scripts = streamScripts();
  const seenKeys = new Set<string>();
  const answered = new Set<string>();
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
    tickets: {
      async list(params, request) {
        await hooks.delay(request?.signal);
        hooks.fail();
        const project = PROJECTS[params.slug];
        if (!project) {
          throw notFound(`project ${params.slug}`);
        }

        const all = hooks.empty
          ? []
          : [...store.values()]
              .filter((item) => item.ticket.project === project.id)
              .filter(
                (item) => !params.state || params.state.includes(item.ticket.status),
              )
              .sort(
                (a, b) =>
                  b.ticket.updated_at.localeCompare(a.ticket.updated_at) ||
                  a.ticket.id.localeCompare(b.ticket.id),
              );

        const start = params.cursor === undefined ? 0 : Number(params.cursor);
        const limit = params.limit ?? DEFAULT_PAGE;
        const end = start + limit;

        return {
          items: all.slice(start, end).map((item) => summarize(item, params.slug)),
          nextCursor: end < all.length ? String(end) : null,
        };
      },
      async get(id, request) {
        await hooks.delay(request?.signal);
        hooks.fail();
        const item = store.get(id);
        if (!item || hooks.empty) {
          throw notFound(`ticket ${id}`);
        }

        return {
          ticket: item.ticket,
          runs: [...item.runs],
          gate_results: [...item.gates],
          interactions: item.interactions.filter(
            (i) => i.status === 'pending' && !answered.has(i.id),
          ),
          wait_reason: item.waitReason,
        };
      },
    },
    interactions: {
      async answer(id, _answer, request) {
        await hooks.delay(request?.signal);
        hooks.fail();
        const owner = [...store.values()].find((item) =>
          item.interactions.some((i) => i.id === id),
        );

        if (!owner) {
          throw notFound(`interaction ${id}`);
        }

        if (answered.has(id)) {
          throw new ApiError('http', `interaction ${id} is not pending`, {
            status: 409,
            code: 'not_pending',
          });
        }

        answered.add(id);
        touch(owner.ticket.id, { status: 'in_progress' });

        return { id, status: 'answered' as const };
      },
    },
    runEvents: {
      watch(watch) {
        const events: readonly RunEvent[] = scripts[watch.runId] ?? [];
        const last = events.at(-1);
        const over =
          events.length === 0 || last?.type === 'finish' || last?.type === 'error';

        let closed = false;
        let index = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;

        watch.onConnection?.('connecting');
        const step = (): void => {
          if (closed) {
            return;
          }

          if (index === 0) {
            watch.onConnection?.('open');
          }

          const event = events[index];
          if (event) {
            index += 1;
            watch.onEvent(event);
            timer = setTimeout(step, hooks.streamDelayMs);
          } else if (over) {
            closed = true;
            watch.onEnd(last?.type === 'error' ? 'error' : 'success');
          }
        };

        timer = setTimeout(step, hooks.streamDelayMs);

        return {
          close() {
            closed = true;
            clearTimeout(timer);
          },
        };
      },
    },
    intake: {
      async chat(input, request) {
        await hooks.delay(request?.signal);
        hooks.fail();
        const slug = slugOfProject(input.projectId);
        const project = slug ? PROJECTS[slug] : undefined;
        if (!slug || !project) {
          return {
            status: 'ignored' as const,
            reason: `unknown project ${input.projectId}`,
          };
        }

        if (seenKeys.has(input.dedupeKey)) {
          return { status: 'duplicate' as const };
        }

        seenKeys.add(input.dedupeKey);
        const numbers = [...store.keys()]
          .filter((id) => id.startsWith(`${project.prefix}-`))
          .map((id) => Number(id.slice(project.prefix.length + 1)));

        const id = `${project.prefix}-${Math.max(0, ...numbers) + 1}` as Ticket['id'];
        const now = new Date().toISOString();
        const base = [...store.values()][0]?.ticket;
        if (!base) {
          return { status: 'ignored' as const, reason: 'no sample data' };
        }

        store.set(id, {
          ticket: {
            ...base,
            id,
            project: project.id,
            title: input.text.slice(0, 80),
            body: input.text,
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

        return { status: 'ticket_created' as const, ticketId: id };
      },
    },
  };
}
