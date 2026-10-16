/**
 * Plan ticket edits: light changes to a ready plan that write a new owner-authored version.
 *
 * Why: before approving, the owner may want to rename a ticket, change its priority, reorder the
 *   list or drop one (d-0133), without sending the whole plan back. An edit never changes a
 *   version the owner may already have read: it writes the next version, authored by the owner,
 *   with a computed diff. A removal that would leave another ticket waiting on something that no
 *   longer exists is refused and names who depends on it, so approval can never file a ticket
 *   that waits forever. Only the latest version of a plan that is waiting for approval can be
 *   edited (`stale_plan` and `phase_mismatch` otherwise).
 *
 * Exports: editPlanTickets().
 * Depends on: @forge/core (plan schemas and rules), tick/card-log, tick/card-notify,
 *   tick/tick-requests, types/card-planning. Writes storage.
 */

import { CardId, PlanVersion, dependentsOf, diffPlans } from '@forge/core';
import type { PlanTicket } from '@forge/core';
import { iso } from '#/shared/time.js';
import { logCardEvent } from '#/tick/card-log.js';
import { notifyCard } from '#/tick/card-notify.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EditPlanInput, EditPlanResult } from '#/types/card-planning.types.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** The ticket list after the edits, or why they are refused. */
function applyEdits(
  tickets: readonly PlanTicket[],
  input: EditPlanInput,
):
  | PlanTicket[]
  | Exclude<
      EditPlanResult,
      { status: 'edited' | 'not_found' | 'stale_plan' | 'phase_mismatch' }
    > {
  const byKey = new Map(tickets.map((t) => [t.key, t]));
  for (const edit of input.tickets) {
    if (!byKey.has(edit.key)) {
      return { status: 'unknown_ticket', key: edit.key };
    }
  }

  const removed = new Set(input.tickets.filter((e) => e.removed).map((e) => e.key));
  for (const key of removed) {
    const dependents = dependentsOf(tickets, key).filter((d) => !removed.has(d));
    if (dependents.length > 0) {
      return { status: 'ticket_has_dependents', key, dependents };
    }
  }

  const kept = tickets
    .filter((t) => !removed.has(t.key))
    .map((t) => {
      const edit = input.tickets.find((e) => e.key === t.key);

      return {
        ...t,
        ...(edit?.title === undefined ? {} : { title: edit.title }),
        ...(edit?.priority === undefined ? {} : { priority: edit.priority }),
        depends_on: t.depends_on.filter((d) => !removed.has(d)),
      };
    });

  if (kept.length === 0) {
    return { status: 'empty_plan' };
  }

  if (input.order === undefined) {
    return kept;
  }

  const wanted = new Set(input.order);
  if (
    wanted.size !== input.order.length ||
    kept.some((t) => !wanted.has(t.key)) ||
    wanted.size !== kept.length
  ) {
    return { status: 'invalid_order' };
  }

  return input.order.map((key) => kept.find((t) => t.key === key) as PlanTicket);
}

/** `PATCH /cards/:id/plan/:version/tickets`: light edits that write a new owner-authored version. */
export async function editPlanTickets(
  deps: EngineDeps,
  state: EngineState,
  cardId: string,
  version: number,
  input: EditPlanInput,
  author: string,
): Promise<EditPlanResult> {
  const id = CardId.safeParse(cardId);
  if (!id.success) {
    return { status: 'not_found' };
  }

  const at = iso(deps.clock.now());
  const result = await deps.storage.transaction(async (tx): Promise<EditPlanResult> => {
    const card = await tx.cards.get(id.data);
    if (!card) {
      return { status: 'not_found' };
    }

    if (card.phase !== 'plan_ready') {
      return { status: 'phase_mismatch' };
    }

    const latest = await tx.cardPlanning.latestPlan(card.id);
    if (!latest || latest.version !== version) {
      return { status: 'stale_plan' };
    }

    const edited = applyEdits(latest.tickets, input);
    if (!Array.isArray(edited)) {
      return edited as EditPlanResult;
    }

    const draft = PlanVersion.parse({
      ...latest,
      version: latest.version + 1,
      created_at: at,
      author: 'owner',
      tickets: edited,
      diff_from_previous: undefined,
    });

    const plan = { ...draft, diff_from_previous: diffPlans(latest, draft) };
    await tx.cardPlanning.appendPlan(plan);
    await logCardEvent(tx, card.id, {
      kind: 'plan_ready',
      at,
      actor: { type: 'user', id: author },
      payload: {
        version: plan.version,
        ticket_count: plan.tickets.length,
        auto_approve_eligible: false,
      },
    });

    return { status: 'edited', plan };
  });

  if (result.status === 'edited') {
    requestTick(deps, state);
    await notifyCard(deps, id.data);
  }

  return result;
}
