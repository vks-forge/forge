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
 *   The owner's mark on a finding ("Real" or "False alarm") is written here too: it must name a finding
 *   that exists on a stage row of this very ticket, so a mark can never be hung on another ticket's review, and
 *   it is the one direct judgement scorecards use.
 *
 * Exports: ticketPipeline(), ticketArtifact(), markFinding().
 * Depends on: @forge/core (ticketPipelineView, TicketId), services/agent-state, services/http/http-errors,
 *   types/agent-store. IO: reads storage and settings, writes finding marks.
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
      runs: await tx.runs.listByTicket(ticket.id),
      marks: await tx.findingMarks.listByTickets([ticket.id]),
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
    found.runs,
    found.marks,
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

const notFinding = (id: string, row: string, index: string): HttpError =>
  new HttpError(
    404,
    'finding_not_found',
    `no finding ${index} on stage row ${row} of ${id}`,
  );

/**
 * Sets (or with `verdict: null` clears) the owner's mark on finding `rawIndex` of stage row `rawRow` of
 * ticket `rawId`, and answers the fresh strip. 404 `ticket_not_found` for an unknown ticket, 404
 * `finding_not_found` for a row that is not this ticket's, has no review, or an index out of range.
 */
export async function markFinding(
  deps: AgentDeps,
  rawId: string,
  rawRow: string,
  rawIndex: string,
  verdict: 'real' | 'false_alarm' | null,
): Promise<{ pipeline: TicketPipelineView }> {
  const id = TicketId.safeParse(rawId);
  if (!id.success) {
    throw notFound(rawId);
  }

  const row = /^[1-9][0-9]*$/.test(rawRow) ? Number(rawRow) : null;
  const index = /^(0|[1-9][0-9]*)$/.test(rawIndex) ? Number(rawIndex) : null;
  const at = new Date(deps.now()).toISOString();
  await deps.storage.transaction(async (tx) => {
    if (!(await tx.tickets.get(id.data))) {
      throw notFound(rawId);
    }

    const stage = row === null ? null : await tx.stageRuns.get(row);
    const findings =
      stage?.ticket_id === id.data ? stage.outcome.review?.findings : undefined;

    if (row === null || index === null || findings?.[index] === undefined) {
      throw notFinding(rawId, rawRow, rawIndex);
    }

    if (verdict === null) {
      await tx.findingMarks.clear(row, index);

      return;
    }

    await tx.findingMarks.set({
      ticket_id: id.data,
      stage_run_id: row,
      finding_index: index,
      verdict,
      marked_at: at,
    });
  });

  const pipeline = await ticketPipeline(deps, rawId);
  if (!pipeline) {
    throw notFound(rawId);
  }

  return { pipeline };
}
