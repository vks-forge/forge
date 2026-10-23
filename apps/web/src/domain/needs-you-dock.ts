/**
 * Needs-you dock rules: the order of waiting items, which one is open, and which action leads.
 *
 * Why: everything that waits on the owner is one small alert by the page title that opens a
 *   modal listing the items (d-0172 shaped the items, the alert replaced the inline block). The
 *   server hands over the items in no promised order and the page refetches every few seconds,
 *   so the screen needs rules it can trust: blockers of the card come before tickets, the modal
 *   lists the newest first, each kind has at most one primary and one secondary action, and the
 *   alert's words and count come from the items' kinds. Long reasons become short chips with the
 *   full text one click away.
 *
 * Exports: DOCK_ACTION_LABEL, STEP_BUDGET_SETTINGS, DOCK_OPEN_EVENT, dockKey(), keyIsFor(),
 *   orderDockItems(), newestFirst(), attentionLabel(), dockActionPlan(), reasonChips().
 * Depends on: @forge/core (types), types/needs-you-dock.types. No IO.
 */

import type { NeedsYouItem, NeedsYouKind } from '@forge/core';
import type {
  DockActionId,
  DockActionPlan,
  DockReasonChips,
} from '#/types/needs-you-dock.types.js';

export const DOCK_ACTION_LABEL: Readonly<Record<DockActionId, string>> = {
  approve_plan: 'Approve plan…',
  request_changes: 'Request changes',
  start_planning: 'Start planning',
  retry_step: 'Retry the step',
  raise_step_budget: 'Raise the step budget',
  run_as_express: 'Run as Express',
  open_ticket: 'Open the ticket',
};

/**
 * Window event a link elsewhere on the page (the Worker thread's "Waiting for your approval")
 * fires to bring one waiting item to the front of the dock; its detail is `{ interactionId }`.
 */
export const DOCK_OPEN_EVENT = 'forge:open-dock-item';

/** Settings page that holds the Director step budget field. */
export const STEP_BUDGET_SETTINGS = '/settings/limits';

/** Card-level blockers first, then what tickets raise. */
const KIND_ORDER: Readonly<Record<NeedsYouKind, number>> = {
  plan_approval: 0,
  director_questions: 1,
  step_budget: 2,
  start_planning: 3,
  held_ticket: 4,
  ticket_signoff: 5,
  ticket_review: 6,
  ticket_escalation: 7,
  tool_approval: 8,
};

const MAX_CHIPS = 3;
const CHIP_MAX_CHARS = 36;

/** A stable identity for an item across refetches. */
export function dockKey(item: NeedsYouItem): string {
  const part = item.interaction_id ?? item.ticket_id ?? item.seq ?? item.raised_at;

  return `${item.kind}:${part}`;
}

/** Whether a dock key is the item of this interaction (keys read `<kind>:<interaction id>`). */
export function keyIsFor(key: string, interactionId: string): boolean {
  return key.endsWith(`:${interactionId}`);
}

/** The items in dock order: by kind, then the one raised first. Does not change the input. */
export function orderDockItems(items: readonly NeedsYouItem[]): readonly NeedsYouItem[] {
  return [...items].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.raised_at.localeCompare(b.raised_at),
  );
}

const has = (item: NeedsYouItem, action: string): boolean =>
  (item.actions as readonly string[]).includes(action);

/** Which button leads for an item and which one follows. `canRespond` is a live escalation whose card the modal shows. */
export function dockActionPlan(item: NeedsYouItem, canRespond: boolean): DockActionPlan {
  const ticket = item.ticket_id !== undefined;

  switch (item.kind) {
    case 'plan_approval':
      return {
        primary: has(item, 'approve_plan') ? 'approve_plan' : null,
        secondary: has(item, 'request_changes') ? 'request_changes' : null,
      };
    case 'director_questions':
      // The open question carries its own options; typing in the message box answers it.
      return { primary: null, secondary: null };
    case 'step_budget':
      return has(item, 'retry_step')
        ? {
            primary: 'retry_step',
            secondary: has(item, 'raise_step_budget') ? 'raise_step_budget' : null,
          }
        : {
            primary: has(item, 'raise_step_budget') ? 'raise_step_budget' : null,
            secondary: null,
          };
    case 'start_planning':
      return {
        primary: has(item, 'start_planning') ? 'start_planning' : null,
        secondary: has(item, 'run_as_express') && ticket ? 'run_as_express' : null,
      };
    case 'ticket_review':
    case 'ticket_signoff':
      return { primary: ticket ? 'open_ticket' : null, secondary: null };
    case 'held_ticket':
    case 'ticket_escalation':
    case 'tool_approval':
      // The modal shows the live escalation's own card, so no button leads: only the way out.
      if (canRespond) {
        return { primary: null, secondary: ticket ? 'open_ticket' : null };
      }

      if (has(item, 'run_as_express') && ticket) {
        return { primary: 'run_as_express', secondary: 'open_ticket' };
      }

      return { primary: ticket ? 'open_ticket' : null, secondary: null };
  }
}

function clip(text: string): string {
  return text.length <= CHIP_MAX_CHARS
    ? text
    : `${text.slice(0, CHIP_MAX_CHARS - 1).trimEnd()}…`;
}

/** The first few reasons as short chips; the rest and any clipped text live in the disclosure. */
export function reasonChips(reasons: readonly string[]): DockReasonChips {
  const shown = reasons.slice(0, MAX_CHIPS);
  const chips = shown.map(clip);
  const clipped = shown.some((reason, index) => chips[index] !== reason);

  return {
    chips,
    hidden: Math.max(reasons.length - MAX_CHIPS, 0),
    needsDisclosure: reasons.length > MAX_CHIPS || clipped,
  };
}

/** The items newest first (by when the server raised them), for the list in the modal. */
export function newestFirst<T extends { readonly raisedAt?: string | undefined }>(
  views: readonly T[],
): readonly T[] {
  return [...views].sort((a, b) => (b.raisedAt ?? '').localeCompare(a.raisedAt ?? ''));
}

/**
 * The alert's words: what the waiting items ask of the owner, with the count when several
 * wait ("Needs your attention · 2"). One kind of ask says so in its own word.
 */
export function attentionLabel(kinds: readonly NeedsYouKind[]): string {
  const first = kinds[0];
  const same = first !== undefined && kinds.every((kind) => kind === first);
  const word =
    same && first === 'ticket_signoff'
      ? 'sign-off'
      : same && (first === 'plan_approval' || first === 'tool_approval')
        ? 'approval'
        : 'attention';

  const base = `Needs your ${word}`;

  return kinds.length > 1 ? `${base} · ${kinds.length}` : base;
}
