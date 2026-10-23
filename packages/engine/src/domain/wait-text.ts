/**
 * waitText — the one plain line that says why a ticket is where it is.
 *
 * Why: the owner reads the board to decide where to look and does not code. "In Progress"
 *   with no Worker, or "Needs you" with nothing to answer, sends them the wrong way; a line
 *   that names who holds the slot or what the card is waiting for sends them the right one.
 *   The scheduler's own structured reason is the source, so the words cannot drift from what
 *   the next tick does. (`describeWait` stays the short code-like line the ticket page keeps.)
 *
 * Exports: waitText(), holderLine().
 * Depends on: domain/wait-reason (clockUtc), types/wait-text, types/pick-next. No IO.
 */

import { clockUtc } from '#/domain/wait-reason.js';
import type { SlotHolder, WaitTextFacts } from '#/types/wait-text.types.js';

const DOING: Readonly<Record<SlotHolder['doing'], string>> = {
  working: 'is working',
  getting_ready: 'is getting its workspace ready',
  being_briefed: 'is being briefed',
};

/** `CHE-3 is working, CHE-4 is getting its workspace ready`. */
export const holderLine = (holders: readonly SlotHolder[]): string =>
  holders.map((h) => `${h.id} ${DOING[h.doing]}`).join(', ');

/** What the owner's last action means for the next step. */
function afterAnswer(action: string, cardId: string | undefined): string {
  if (action === 'replan') {
    return `You chose Re-plan: waiting for the new plan${cardId === undefined ? '' : ` of ${cardId}`}`;
  }

  if (action === 'rework') {
    return 'You chose Send back for rework: it starts again when a Worker is free';
  }

  return 'You answered: waiting for the next step';
}

function schedulerLine(facts: WaitTextFacts): string | null {
  const wait = facts.scheduler;
  if (wait === undefined) {
    return null;
  }

  switch (wait.kind) {
    case 'deps':
      return `Waiting for ${wait.ids.join(', ')} to finish`;
    case 'plan':
      return `${facts.cardId ?? 'The card'} is being re-planned: this ticket waits for the new plan`;
    case 'prep':
      return wait.step === ''
        ? 'Getting the workspace ready'
        : `Getting the workspace ready: ${wait.step}`;
    case 'quota':
      return `${wait.harness} is out of quota until ${clockUtc(wait.until)}`;
    case 'backoff':
      return `Trying again after a failure at ${clockUtc(wait.until)}`;
    case 'cap': {
      const who = facts.holders.length > 0 ? `: ${holderLine(facts.holders)}` : '';

      return `Waiting for a Worker slot (${wait.used} of ${wait.limit} in use)${who}`;
    }
  }
}

/** The line for the ticket's phase; always non-empty. */
export function waitText(facts: WaitTextFacts): string {
  switch (facts.phase) {
    case 'done':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'working':
      return 'A Worker is working on it';
    case 'checking':
      return 'Checks are running';
    case 'waiting_you':
      if (facts.status === 'review') {
        return 'Ready for your review';
      }

      if (facts.status === 'needs_signoff') {
        return 'Needs your sign-off';
      }

      return facts.blockedReason === undefined
        ? 'Waiting for your answer'
        : `Waiting for you: ${facts.blockedReason}`;
    case 'stuck':
      return facts.settledAction === undefined
        ? 'Waiting on you, but no question is open'
        : afterAnswer(facts.settledAction, facts.cardId);
    case 'held_by_plan':
      return facts.status === 'waiting_human' && facts.settledAction !== undefined
        ? afterAnswer(facts.settledAction, facts.cardId)
        : (schedulerLine(facts) ??
            `${facts.cardId ?? 'The card'} is being re-planned: this ticket waits for the new plan`);
    case 'queued':
      return (
        schedulerLine(facts) ??
        (facts.status === 'in_progress' || facts.status === 'verifying'
          ? 'Queued: about to get a Worker'
          : 'Queued: about to start')
      );
    case 'setting_up':
      return schedulerLine(facts) ?? 'Getting the workspace ready';
    case 'waiting_slot':
    case 'waiting_deps':
    case 'paused_quota':
    case 'backing_off':
      return schedulerLine(facts) ?? 'Waiting to start';
  }
}
