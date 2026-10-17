/**
 * The ticket page's pipeline strip and its artifacts, read from stage rows.
 *
 * Why: the owner wants to see where a ticket is in its lane pipeline and what each stage was
 *   shown or made. Everything is stored (the ticket's own pipeline copy, one row per stage
 *   attempt, the artifacts), so the strip is rolled up by the core view function from those
 *   rows in one transaction and the page can never disagree with the engine. Before the ticket's
 *   first dispatch there is no copy and the answer is null. Artifacts are read one by one and
 *   always inside their ticket, so one ticket's id can never fetch another's content; the owner
 *   may read the Worker's own narrative here, which reviewers never see.
 *
 * Exports: ticketPipeline(), ticketArtifact().
 * Depends on: @forge/core (ticketPipelineView, TicketId), services/agent-state, services/http/http-errors,
 *   types/agent-store. IO: reads storage and settings.
 */

import { TicketId, ticketPipelineView } from '@forge/core';
import type { StageArtifact, TicketPipelineView } from '@forge/core';
import { createAgentState } from '#/services/agent-state.js';
import { HttpError } from '#/services/http/http-errors.js';
import type { AgentDeps } from '#/types/agent-store.types.js';

const notFound = (raw: string): HttpError =>
  new HttpError(404, 'ticket_not_found', `no ticket ${raw}`);

/** The strip of ticket `rawId`, or null before its first dispatch; 404 for an unknown ticket. */
export async function ticketPipeline(
  deps: AgentDeps,
  rawId: string,
): Promise<TicketPipelineView | null> {
  const id = TicketId.safeParse(rawId);
  if (!id.success) {
    throw notFound(rawId);
  }

  const found = await deps.storage.transaction(async (tx) => {
    const ticket = await tx.tickets.get(id.data);
    if (!ticket) {
      return null;
    }

    return {
      ticket,
      project: await tx.projects.get(ticket.project),
      snapshot: await tx.ticketPipelines.get(ticket.id),
      records: await tx.stageRuns.listByTicket(ticket.id),
      artifacts: await tx.stageArtifacts.listByTicket(ticket.id),
    };
  });

  if (!found) {
    throw notFound(rawId);
  }

  if (!found.snapshot) {
    return null;
  }

  const roster = found.project
    ? (await createAgentState(deps).read({ scope: 'project', slug: found.project.slug }))
        .views
    : [];

  return ticketPipelineView(
    found.snapshot,
    found.records,
    found.artifacts,
    found.ticket,
    roster,
  );
}

/** One artifact of ticket `rawId`; 404 `ticket_not_found` or `artifact_not_found`. */
export async function ticketArtifact(
  deps: AgentDeps,
  rawId: string,
  rawArtifact: string,
): Promise<StageArtifact> {
  const id = TicketId.safeParse(rawId);
  if (!id.success) {
    throw notFound(rawId);
  }

  const artifactId = /^[1-9][0-9]*$/.test(rawArtifact) ? Number(rawArtifact) : null;
  const found = await deps.storage.transaction(async (tx) => {
    if (!(await tx.tickets.get(id.data))) {
      return 'no_ticket' as const;
    }

    return artifactId === null ? null : await tx.stageArtifacts.get(id.data, artifactId);
  });

  if (found === 'no_ticket') {
    throw notFound(rawId);
  }

  if (!found) {
    throw new HttpError(
      404,
      'artifact_not_found',
      `no artifact ${rawArtifact} on ${id.data}`,
    );
  }

  return found;
}
