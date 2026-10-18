/**
 * Tool `get_ticket` — read the run's ticket and its direct relations.
 *
 * Why: a Worker needs the ticket's requirements and its neighbours (parent, blockers)
 *   but must not browse the whole backlog; unrelated tickets may hold other projects'
 *   plans or secrets. Access is limited to the run's own ticket, its parent and its
 *   blockers, and only the own ticket carries relations and runs, so a chain of
 *   lookups cannot walk the dependency graph. A check agent (reviewer, researcher) gets no `runs`
 *   at all, so it cannot find the writer's session. The answer is plain JSON the model can quote.
 *
 * Exports: getTicketTool.
 * Depends on: @forge/core, domain/check-run, shared/define-tool, schemas/tool-inputs. IO: storage read.
 */

import { PolicyDeniedError, UnknownForgeError } from '@forge/core';
import type { Ticket } from '@forge/core';
import { isCheckRun, isWriterGroupMember } from '#/domain/check-run.js';
import { GetTicketInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';

const brief = (t: Ticket) => ({ id: t.id, title: t.title, status: t.status });

export const getTicketTool = defineTool({
  name: 'get_ticket',
  description:
    'Read a ticket (your own, its parent, or one that blocks it): title, body, lane, status, relations and your runs.',
  risk: 'read',
  inputSchema: GetTicketInput,
  async handler(ctx, { id }) {
    return ctx.deps.storage.transaction(async (tx) => {
      const own = await tx.tickets.get(ctx.run.ticket_id as Ticket['id']);
      if (!own) {
        throw new UnknownForgeError(`run ticket ${ctx.run.ticket_id} not found`);
      }

      const allowed = new Set<string>([
        own.id,
        ...(own.parent ? [own.parent] : []),
        ...own.blocked_by,
      ]);

      if (!allowed.has(id)) {
        throw new PolicyDeniedError(`ticket ${id} is not related to this run`);
      }

      const ticket = id === own.id ? own : await tx.tickets.get(id as Ticket['id']);
      if (!ticket) {
        throw new UnknownForgeError(`ticket ${id} not found`);
      }

      // Relations only for the run's own ticket: a related ticket's neighbours would be
      // second-degree reads into tickets this run has no business with.
      const isOwn = id === own.id;
      const parent = isOwn && ticket.parent ? await tx.tickets.get(ticket.parent) : null;
      const blockers = isOwn
        ? await Promise.all(ticket.blocked_by.map((b) => tx.tickets.get(b)))
        : [];

      // A check agent never sees the ticket's runs: they lead to the writer's own account.
      const showRuns = isOwn && !(await isCheckRun(tx, ctx.run));
      const listed = showRuns ? await tx.runs.listByTicket(own.id) : [];

      // A writer-group member sees only its own run: siblings' runs lead to their accounts.
      const runs = (await isWriterGroupMember(tx, ctx.run))
        ? listed.filter((r) => r.id === ctx.run.id)
        : listed;

      return JSON.stringify({
        ticket: {
          id: ticket.id,
          project: ticket.project,
          title: ticket.title,
          body: ticket.body,
          type: ticket.type,
          lane: ticket.lane,
          tier_predicted: ticket.tier_predicted,
          status: ticket.status,
          blocked_reason: ticket.blocked_reason,
          parent: ticket.parent,
          blocked_by: ticket.blocked_by,
        },
        relations: {
          parent: parent ? brief(parent) : null,
          blocked_by: blockers.filter((b): b is Ticket => b !== null).map(brief),
        },
        ...(isOwn && !showRuns
          ? {}
          : {
              runs: runs.map((r) => ({
                id: r.id,
                status: r.status,
                harness: r.harness,
                started_at: r.started_at,
              })),
            }),
      });
    });
  },
});
