/**
 * Pipeline proposals: the Director noticing it keeps making the same change, and telling the owner.
 *
 * Why: one ticket's pipeline tweak is a judgement call; the same tweak on several tickets from several cards
 *   suggests the owner's lane list is out of date. No model decides to propose: after a ticket takes its
 *   snapshot, each plan op applied to it is keyed (`adjustmentKey`), the project's recent tickets are read
 *   back (their copies carry the keys), and core `shouldPropose` counts them (enough tickets, enough cards, the
 *   same lane and base list, nothing already decided on that key). A proposal carries the one op, the project's
 *   current lane list with the op applied (it must pass the pipeline rules, or there is no proposal) and up to
 *   three quoted reasons. It is a row of its own, not an escalation: it blocks nothing, and only the owner
 *   decides it, through the pipeline store. Fallback swaps never count (they are about availability, not
 *   shape), and a ticket whose routing rules added stages is left out, because its base list is not the lane's
 *   own and a proposal over it could never be accepted.
 *
 * Exports: maybeProposeTx(), proposalHistory().
 * Depends on: @forge/core (shouldPropose, pickEvidence, applyAdjustments, pipelineHash), tick/{lane-pipeline,planning-state}.
 *   Reads and writes inside the caller's transaction.
 */

import { applyAdjustments, pickEvidence, pipelineHash, shouldPropose } from '@forge/core';
import type {
  PipelineAdjustment,
  ProposalHistoryEntry,
  StorageTx,
  Ticket,
  TicketPipeline,
} from '@forge/core';
import { adjustContext, lanePipeline } from '#/tick/lane-pipeline.js';
import { directorFor } from '#/tick/planning-state.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

const DAY_MS = 86_400_000;
const PAGE = 200;
const MAX_TICKETS = 500;

/** The plan ops applied to the project's recent tickets, one entry each, read from their pipeline copies. */
export async function proposalHistory(
  tx: StorageTx,
  project: string,
  sinceMs: number,
): Promise<ProposalHistoryEntry[]> {
  const recent: Ticket[] = [];
  let after: { updated_at: string; id: Ticket['id'] } | undefined;
  while (recent.length < MAX_TICKETS) {
    const page = await tx.tickets.listByProject(project, {
      limit: PAGE,
      ...(after === undefined ? {} : { after }),
    });

    for (const t of page) {
      if (Date.parse(t.updated_at) >= sinceMs) {
        recent.push(t);
      }
    }

    const last = page[page.length - 1];
    if (page.length < PAGE || !last || Date.parse(last.updated_at) < sinceMs) {
      break;
    }

    after = { updated_at: last.updated_at, id: last.id };
  }

  const byId = new Map(recent.map((t) => [t.id as string, t]));
  const snapshots = await tx.ticketPipelines.listByTickets(
    [...byId.keys()].slice(0, MAX_TICKETS),
  );

  return snapshots.flatMap((s) =>
    s.adjustments
      .filter((a) => a.status === 'applied' && a.cause === 'plan')
      .map((a) => {
        const card = byId.get(s.ticket_id)?.card_id;

        return {
          ticket_id: s.ticket_id,
          ...(card === undefined ? {} : { card_id: card }),
          at: a.at,
          key: a.key,
          base_hash: s.base_hash,
          lane: s.lane,
          reason: a.op.reason,
        };
      }),
  );
}

/**
 * Inserts a pending proposal for each plan op of `snapshot` that has now been applied often enough on the
 * same base. Idempotent: a second call (a restart, a re-snapshot) finds the existing row and adds nothing.
 */
export async function maybeProposeTx(
  tx: StorageTx,
  ctx: EngineCtx,
  ticket: Ticket,
  snapshot: TicketPipeline,
): Promise<void> {
  const entries: PipelineAdjustment[] = snapshot.adjustments.filter(
    (a) => a.status === 'applied' && a.cause === 'plan',
  );

  if (entries.length === 0) {
    return;
  }

  const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
  const { pipelines } = directorFor(ctx, slug).director;
  const lane = lanePipeline(ctx.config, slug, snapshot.lane);
  // A ticket whose routing added stages has a base list that is not the lane's own: its ops cannot be proposed.
  if (pipelineHash(lane.definition) !== snapshot.base_hash) {
    return;
  }

  const history = await proposalHistory(
    tx,
    ticket.project,
    ctx.now - pipelines.propose_window_days * DAY_MS,
  );

  const existing = await tx.pipelineProposals.list(slug);
  const suppressed = existing.map((p) => ({
    lane: p.lane,
    key: p.key,
    base_hash: p.base_hash,
  }));

  for (const entry of entries) {
    const decision = shouldPropose({
      key: entry.key,
      lane: snapshot.lane,
      base_hash: snapshot.base_hash,
      history,
      settings: pipelines,
      suppressed,
      now: ctx.now,
    });

    if (!decision.propose) {
      continue;
    }

    // The proposed list is the lane's own list with the op applied; if it does not hold, nothing is proposed.
    const result = applyAdjustments(
      lane.definition,
      [entry.op],
      adjustContext(lane.roster, snapshot.lane, []),
      { cause: 'plan', at: ctx.nowIso },
    );

    if (result.applied.length !== 1) {
      continue;
    }

    const id = await tx.pipelineProposals.insert({
      project: slug,
      lane: snapshot.lane,
      key: entry.key,
      base_hash: snapshot.base_hash,
      op: entry.op,
      proposed: result.definition,
      evidence: pickEvidence(decision.matching),
      count: decision.count,
      created_at: ctx.nowIso,
    });

    if (id !== 'exists') {
      suppressed.push({
        lane: snapshot.lane,
        key: entry.key,
        base_hash: snapshot.base_hash,
      });
    }
  }
}
