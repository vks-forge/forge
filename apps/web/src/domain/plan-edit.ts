/**
 * Plan edit: the light ticket edits an owner may make to a ready plan, and the request they become.
 *
 * Why: before approving, the owner often wants a small fix (a clearer title, a ticket dropped,
 *   one moved earlier, a higher priority) without sending the whole plan back to the Director.
 *   The edits are held as a draft so several can be made and sent once: every save writes a new
 *   plan version on the server, so one request per batch keeps the version list readable. Only
 *   what actually changed is sent, and reordering is sent only when the surviving tickets are
 *   in a different order than the plan has them. A removed ticket stays in the draft (greyed,
 *   restorable) until saved, so a mis-click costs nothing. The owner may also pick a ticket's care level (lane); it is
 *   sent only when it differs from the plan, and the server then keeps it as the owner's choice (d-0177). The owner may also take one of the Director's
 *   pipeline changes off a ticket (`drop_pipeline_ops`, by position), never add one.
 *
 * Exports: draftOf(), moveDraft(), patchDraft(), toggleDropOp(), isDraftDirty(), editBody(), canSaveDraft().
 * Depends on: schemas/plan (type), types/plan.types. No IO.
 */

import type { PlanTicket } from '#/schemas/plan.js';
import type { DraftTicket, PlanEditBody } from '#/types/plan.types.js';

export function draftOf(tickets: readonly PlanTicket[]): readonly DraftTicket[] {
  return tickets.map((t) => ({
    key: t.key,
    title: t.title,
    priority: t.priority,
    lane: t.lane,
    removed: false,
    dropOps: [],
  }));
}

/** Moves a ticket one place up (`-1`) or down (`1`) among the tickets, a no-op at the ends. */
export function moveDraft(
  draft: readonly DraftTicket[],
  key: string,
  step: -1 | 1,
): readonly DraftTicket[] {
  const from = draft.findIndex((t) => t.key === key);
  const to = from + step;
  if (from < 0 || to < 0 || to >= draft.length) {
    return draft;
  }

  const next = [...draft];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as DraftTicket);

  return next;
}

export function patchDraft(
  draft: readonly DraftTicket[],
  key: string,
  change: Partial<Omit<DraftTicket, 'key'>>,
): readonly DraftTicket[] {
  return draft.map((t) => (t.key === key ? { ...t, ...change } : t));
}

/** Takes the Director's op at `position` off a ticket, or puts it back when it was already taken off. */
export function toggleDropOp(
  draft: readonly DraftTicket[],
  key: string,
  position: number,
): readonly DraftTicket[] {
  return draft.map((t) =>
    t.key === key
      ? {
          ...t,
          dropOps: t.dropOps.includes(position)
            ? t.dropOps.filter((p) => p !== position)
            : [...t.dropOps, position].sort((a, b) => a - b),
        }
      : t,
  );
}

const keptKeys = (tickets: readonly { key: string; removed?: boolean }[]): string[] =>
  tickets.filter((t) => t.removed !== true).map((t) => t.key);

/** What would be sent, or null when the draft equals the plan. */
export function editBody(
  original: readonly PlanTicket[],
  draft: readonly DraftTicket[],
): PlanEditBody | null {
  const byKey = new Map(original.map((t) => [t.key, t]));
  const tickets: PlanEditBody['tickets'][number][] = [];

  for (const item of draft) {
    const was = byKey.get(item.key);
    if (!was) {
      continue;
    }

    const title = item.title.trim();
    const change = {
      ...(title !== was.title && title !== '' ? { title } : {}),
      ...(item.priority !== was.priority ? { priority: item.priority } : {}),
      ...(item.lane !== was.lane ? { lane: item.lane } : {}),
      ...(item.removed ? { removed: true } : {}),
      ...(!item.removed && item.dropOps.length > 0
        ? { drop_pipeline_ops: item.dropOps }
        : {}),
    };

    if (Object.keys(change).length > 0) {
      tickets.push({ key: item.key, ...change });
    }
  }

  const order = keptKeys(draft);
  const planOrder = keptKeys(original).filter((key) => order.includes(key));
  const reordered = order.join('\n') !== planOrder.join('\n');

  if (tickets.length === 0 && !reordered) {
    return null;
  }

  return { tickets, ...(reordered ? { order } : {}) };
}

export function isDraftDirty(
  original: readonly PlanTicket[],
  draft: readonly DraftTicket[],
): boolean {
  return editBody(original, draft) !== null;
}

/** A draft can be saved when it changed, nothing has an empty title and one ticket remains. */
export function canSaveDraft(
  original: readonly PlanTicket[],
  draft: readonly DraftTicket[],
): boolean {
  return (
    isDraftDirty(original, draft) &&
    draft.every((t) => t.removed || t.title.trim() !== '') &&
    draft.some((t) => !t.removed)
  );
}
