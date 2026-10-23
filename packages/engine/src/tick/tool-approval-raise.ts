/**
 * Raising a tool approval: the one door that parks a Worker's call for the owner.
 *
 * Why: on Standard and Full a call policy marks `ask` (an install, an edit under `migrations/`)
 *   must stop visibly. The hook has already refused to run it; this door makes the wait
 *   durable: one pending `permission` item at the owner's stage carrying the exact command, the
 *   rule that asked and whether "Always" can be offered, a `permission` event in the run's
 *   thread, and a line in the card's history, all in one transaction so the Worker is never told
 *   it waits for an item that does not exist. A Worker that repeats the call gets the same item
 *   (no nagging), a runaway Worker is bounded at five open items, and the Worker's own
 *   description is kept only as a clipped "why" for the owner: it never becomes the command
 *   shown. Express has nobody to ask, and a run that is no longer live (or a check running in
 *   verification) cannot be resumed with an answer, so those are refused and the hook denies
 *   (tool-system.md §5.4, execution-plane.md §6, d-0175).
 *
 * Exports: raiseToolApproval(), MAX_PENDING_APPROVALS_PER_RUN.
 * Depends on: @forge/core (isRunActive, toEscalation, escalation schemas), tick/{card-notify,escalation-raise},
 *   types/{engine,engine-state,approval}. Writes inside one transaction.
 */

import { isRunActive, toEscalation } from '@forge/core';
import type { EscalationPermission, Interaction, StorageTx, Ticket } from '@forge/core';
import { iso } from '#/shared/time.js';
import { notifyCard } from '#/tick/card-notify.js';
import { raiseEscalation } from '#/tick/escalation-raise.js';
import type {
  ToolApprovalRefusal,
  ToolApprovalRequest,
  ToolApprovalResult,
} from '#/types/approval.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** A run that keeps asking is bounded: past this many open items the next ask is refused. */
export const MAX_PENDING_APPROVALS_PER_RUN = 5;

const WHY_MAX = 300;
const SUMMARY_WHAT_MAX = 200;

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The pending permission item of `row`'s ticket with this key, read from the typed payload. */
const keyOf = (row: Interaction): string | null => {
  const payload = toEscalation(row).payload;

  return payload.kind === 'permission' ? payload.approval_key : null;
};

/** The Worker's own reason: the call's `description` if it gave a string, else its last words before the call. */
async function whyOf(
  tx: StorageTx,
  runId: string,
  description: unknown,
): Promise<string | undefined> {
  let source = typeof description === 'string' ? description : '';
  if (oneLine(source) === '') {
    const texts = (await tx.runEvents.listByRun(runId)).flatMap((e) =>
      e.type === 'text' ? [e.text] : [],
    );

    source = texts.at(-1) ?? '';
  }

  const text = clip(oneLine(source), WHY_MAX);

  return text === '' ? undefined : text;
}

/** Opens the owner's approval for `req` (see the header for the refusals); never throws on a refusal. */
export async function raiseToolApproval(
  deps: EngineDeps,
  req: ToolApprovalRequest,
): Promise<ToolApprovalResult> {
  const nowIso = iso(deps.clock.now());
  const out = await deps.storage.transaction(
    async (tx): Promise<{ result: ToolApprovalResult; card?: Ticket['card_id'] }> => {
      const refuse = (reason: ToolApprovalRefusal) => ({
        result: { status: 'refused', reason } as const,
      });

      const run = await tx.runs.get(req.runId);
      if (!run || !isRunActive(run)) {
        return refuse('run_not_live');
      }

      if (run.lane === 'express') {
        return refuse('express');
      }

      const ticket = await tx.tickets.get(run.ticket_id as Ticket['id']);
      if (!ticket || ticket.status !== 'in_progress') {
        return refuse('not_in_progress');
      }

      const open = (await tx.interactions.listByTicket(ticket.id)).filter(
        (i) => i.status === 'pending' && i.kind === 'permission',
      );

      const same = open.find((i) => keyOf(i) === req.approvalKey);
      if (same) {
        return {
          result: { status: 'raised', interactionId: same.id, created: false },
          card: ticket.card_id,
        };
      }

      if (
        open.filter((i) => i.run_id === run.id).length >= MAX_PENDING_APPROVALS_PER_RUN
      ) {
        return refuse('too_many_pending');
      }

      const why = await whyOf(tx, run.id, req.description);
      const payload: EscalationPermission = {
        kind: 'permission',
        tool: req.tool,
        action: req.action,
        what: req.what,
        approval_key: req.approvalKey,
        reason_code: req.reasonCode,
        ...(why === undefined ? {} : { why }),
        lane: run.lane,
        always: req.always,
        summary: `Waiting for your approval: ${clip(oneLine(req.what), SUMMARY_WHAT_MAX)}`,
      };

      const id = await raiseEscalation(
        tx,
        deps,
        nowIso,
        ticket,
        payload,
        'owner',
        run.id,
      );

      if (id === null) {
        return refuse('closed');
      }

      await tx.runEvents.append(run.id, {
        type: 'permission',
        ts: nowIso,
        interaction_id: id,
        call_id: req.callId ?? id,
        tool: req.tool,
        decision: 'ask',
      });

      return {
        result: { status: 'raised', interactionId: id, created: true },
        card: ticket.card_id,
      };
    },
  );

  if (out.card !== undefined) {
    await notifyCard(deps, out.card);
  }

  return out.result;
}
