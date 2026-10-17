/**
 * What a settled run asks of a person: the question a Worker paused on, or the failure that
 * parks its ticket.
 *
 * Why: when a run pauses or fails past what a retry can fix, the ticket waits on someone, and
 *   that wait must be one interaction the owner's screens can show and act on. A Worker's own
 *   tool wrote its question in its own words; this turns it into the typed question (and gives
 *   it the ticket's card) so the Director can look first and the owner sees one shape. A failed
 *   run parks the ticket and raises a failure escalation with what was tried; a run that ended
 *   on a login or on a tool Forge does not allow yet raises a setup escalation instead, because
 *   a retry would fail the same way. The setup cause is read from the run's receipts (the denial
 *   that stopped it), never guessed from text.
 *
 * Exports: ensureQuestion(), parkRun(), setupCauseOfRun().
 * Depends on: @forge/core (escalation rules and schemas), @forge/tools (receipt types),
 *   domain/escalation-copy, tick/card-log, tick/escalation-raise, tick/ticket-moves.
 *   Writes inside the caller's transaction.
 */

import {
  EscalationPayload,
  InteractionKind,
  classifyPark,
  setupCauseFor,
  toEscalation,
} from '@forge/core';
import type {
  ErrorFamily,
  Interaction,
  Run,
  SetupCause,
  StorageTx,
  Ticket,
} from '@forge/core';
import { fixHrefFor, setupSummary } from '#/domain/escalation-copy.js';
import { iso } from '#/shared/time.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { attemptsOf, raiseEscalation, stageFor } from '#/tick/escalation-raise.js';
import { moveTicketTx, parkPlan } from '#/tick/ticket-moves.js';
import type { EngineCtx, Pump } from '#/types/engine-state.types.js';
import type { RaisedPayload } from '#/types/escalation.types.js';
import type { SettleOptions } from '#/types/tick.types.js';

const MISSING_PROMPT = '(the Worker paused without a recorded question)';

/** A Worker's question as the typed payload: the same words, the source its tool implies, no options yet. */
function typedQuestion(row: Interaction): EscalationPayload {
  const read = toEscalation(row).payload;

  return {
    kind: 'question',
    text: read.kind === 'question' ? read.text : MISSING_PROMPT,
    source: row.kind === 'blocked' ? 'report_blocked' : 'ask_director',
    options: [],
  };
}

/**
 * Makes sure the interaction a pause points at exists in its typed form with its card: the
 * Worker's tool may have written it (in its own words, with no card) or the engine builds it
 * from the `ask` event the stream carried. It starts in the Director's stage either way. The
 * card's history records that a question opened, once per pause.
 */
export async function ensureQuestion(
  ctx: EngineCtx,
  tx: StorageTx,
  run: Run,
  id: string,
  pump?: Pump,
): Promise<void> {
  const ticket = await tx.tickets.get(run.ticket_id as Ticket['id']);
  let row = await tx.interactions.get(id);
  if (row) {
    const typed = EscalationPayload.safeParse(row.payload).success;
    const patch = {
      ...(typed ? {} : { payload: typedQuestion(row) }),
      ...(row.card_id === undefined && ticket?.card_id !== undefined
        ? { card_id: ticket.card_id }
        : {}),
    };

    if (Object.keys(patch).length > 0) {
      await tx.interactions.update(id, patch);
      row = { ...row, ...patch };
    }
  } else {
    const ask = pump?.asks.get(id);
    const kind = InteractionKind.safeParse(ask?.kind);
    const asked: Interaction['kind'] =
      kind.success && kind.data !== 'failure' && kind.data !== 'setup'
        ? kind.data
        : 'question';

    row = {
      id,
      ticket_id: run.ticket_id,
      run_id: run.id,
      kind: asked,
      ...(ticket?.card_id === undefined ? {} : { card_id: ticket.card_id }),
      payload: { prompt: ask?.prompt ?? MISSING_PROMPT },
      status: 'pending',
      asked_at: ctx.nowIso,
      timeout_at: iso(ctx.now + ctx.config.forge.engine.interaction_timeout_ms),
    };

    row = { ...row, payload: typedQuestion(row) };
    await tx.interactions.insert(row);
  }

  await logCardEvent(tx, ticket?.card_id, {
    kind: 'interaction_opened',
    at: ctx.nowIso,
    actor: ENGINE_ACTOR,
    payload: { ticket_id: run.ticket_id, interaction_id: id, interaction_kind: row.kind },
  });
}

/**
 * The setup a run's end calls for: a login for `auth`, the tool whose last fixable denial stopped
 * a `policy_denied` run (read from its receipts), or a harness build that changed under the
 * approvals. Null for an ordinary failure.
 */
export async function setupCauseOfRun(
  ctx: EngineCtx,
  tx: StorageTx,
  run: Run,
  family: ErrorFamily | undefined,
  build: SettleOptions['parkBuild'],
): Promise<SetupCause | null> {
  const harness = await tx.harnesses.get(run.harness);
  const kind = harness?.kind ?? 'claude';
  if (build !== undefined) {
    return {
      type: 'harness_build',
      harness_kind: kind,
      version: build.installed ?? 'unknown',
    };
  }

  if (family !== 'auth' && family !== 'policy_denied') {
    return null;
  }

  const receipts = family === 'policy_denied' ? await ctx.deps.receipts.list(run.id) : [];
  const decisions = receipts.flatMap((r) =>
    r.kind === 'decision'
      ? [{ tool: r.tool, reason: r.reason, decision: r.decision, version: r.version }]
      : [],
  );

  return setupCauseFor(family, decisions, {
    harness_id: run.harness,
    harness_kind: kind,
    version: harness?.version ?? 'unknown',
  });
}

/**
 * Parks `ticket` with `reason` (one `parked` event) and raises the escalation that says why: a
 * setup (owner's stage at once) or a failure (the Director looks first). `family` is the run's
 * error family, kept on the failure for the owner's diagnosis.
 */
export async function parkRun(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  run: Run,
  reason: string,
  family: ErrorFamily | undefined,
  setup: SetupCause | null,
): Promise<void> {
  const moved = await moveTicketTx(tx, ticket.id, ctx.nowIso, (t) => parkPlan(t, reason));
  if (!moved.ok) {
    ctx.deps.log?.('error', `could not park ${ticket.id}`, { reason: moved.reason });

    return;
  }

  ctx.report.parked.push({ ticketId: ticket.id, reason });
  const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
  const payload: RaisedPayload =
    setup === null
      ? {
          kind: 'failure',
          cause:
            classifyPark({ status: 'waiting_human', blocked_reason: reason })?.cause ??
            'not_retried',
          summary: reason,
          attempts: await attemptsOf(tx, ticket.id),
          ...(family === undefined ? {} : { error_family: family }),
          lane: ticket.lane,
        }
      : {
          kind: 'setup',
          cause: setup,
          summary: setupSummary(setup),
          fix_href: fixHrefFor(setup, slug, run.harness),
        };

  await raiseEscalation(
    tx,
    ctx.deps,
    ctx.nowIso,
    moved.ticket,
    payload,
    await stageFor(ctx, tx, ticket, setup !== null),
    run.id,
  );
}
