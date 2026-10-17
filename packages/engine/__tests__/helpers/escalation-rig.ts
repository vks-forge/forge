/**
 * Escalation scenario helpers: put a ticket in each way of waiting, and read what the owner sees.
 *
 * Why: every escalation scenario starts by getting a ticket to wait (a Worker's question, a
 *   crash past the retry cap, a login failure, a lane hold) and ends by reading the interaction,
 *   the card history and the ticket. Writing the setup once keeps each scenario to the one
 *   behaviour it pins, and the readers show exactly the rows the owner's screens are built from.
 *
 * Exports: ask(), crashTo(), pendingOf(), interactionsOf(), cardEventsOf(), ownerPending(), setTier(),
 *   overrideDirector().
 * Depends on: @forge/core, helpers/rig, helpers/scripted-driver. No IO.
 */

import type { CardEvent, CardId, Interaction, Ticket } from '@forge/core';
import { makeResult } from '#tests/helpers/scripted-driver.js';
import type { Rig } from '#tests/helpers/rig.js';

/**
 * Starts a ticket (run-1), has its Worker ask `prompt` the way the MCP tool writes it (a legacy
 * payload, no card, no stage), pauses the run and settles it; returns the ticket id. The ticket
 * is `waiting_human` when this returns, and the Director has had its first look in that tick.
 */
export async function ask(
  rig: Rig,
  prompt = 'Which colour?',
  kind: 'question' | 'blocked' = 'question',
): Promise<string> {
  const id = await rig.request('Add a flag');
  await rig.tick();
  rig.driver.emit('run-1', { type: 'ask', interaction_id: 'int-q1', kind, prompt });
  await rig.storage.transaction((tx) =>
    tx.interactions.insert({
      id: 'int-q1',
      ticket_id: id,
      run_id: 'run-1',
      kind,
      payload: kind === 'blocked' ? { reason: prompt } : { prompt },
      status: 'pending',
      asked_at: new Date(rig.clock.now()).toISOString(),
      timeout_at: new Date(rig.clock.now() + 4 * 3_600_000).toISOString(),
    }),
  );

  rig.driver.finish(
    'run-1',
    makeResult({
      status: 'paused',
      pauseReason: 'interaction',
      interactionId: 'int-q1',
      session: 'sess-A',
    }),
  );

  await rig.flush();
  await rig.tick();

  return id;
}

/** Crashes the current run of `id` `times` times, ticking through each retry, so the retry cap is reached on the last. */
export async function crashTo(rig: Rig, id: string, times = 2): Promise<void> {
  for (let n = 1; n <= times; n++) {
    const runId = (await rig.ticket(id)).assignee_run_id;
    if (!runId) {
      throw new Error('no run to crash');
    }

    rig.driver.finish(runId, makeResult({ status: 'error', errorFamily: 'crash' }));
    await rig.flush();
    await rig.tick();
    rig.clock.advance(60_000);
    if (n < times) {
      await rig.tick();
    }
  }
}

export const interactionsOf = (rig: Rig, ticketId: string): Promise<Interaction[]> =>
  rig.storage.transaction((tx) => tx.interactions.listByTicket(ticketId));

/** The ticket's pending interactions of `kind` (any when absent). */
export async function pendingOf(
  rig: Rig,
  ticketId: string,
  kind?: Interaction['kind'],
): Promise<Interaction[]> {
  return (await interactionsOf(rig, ticketId)).filter(
    (i) => i.status === 'pending' && (kind === undefined || i.kind === kind),
  );
}

/** What the owner is shown: pending interactions already handed over. */
export async function ownerPending(rig: Rig): Promise<Interaction[]> {
  return (await rig.storage.transaction((tx) => tx.interactions.listPending())).filter(
    (i) => i.escalated_at !== undefined,
  );
}

export async function cardEventsOf<K extends CardEvent['kind']>(
  rig: Rig,
  cardId: CardId | undefined,
  kind: K,
): Promise<Extract<CardEvent, { kind: K }>[]> {
  if (cardId === undefined) {
    throw new Error('the ticket has no card');
  }

  const all = await rig.storage.transaction((tx) =>
    tx.cardEvents.list(cardId, { limit: 500 }),
  );

  return all.filter((e): e is Extract<CardEvent, { kind: K }> => e.kind === kind);
}

/** Sets the predicted tier of a ticket directly (the triage default is A). */
export async function setTier(rig: Rig, id: string, tier: Ticket['tier_predicted']) {
  const t = await rig.ticket(id);
  await rig.storage.transaction((tx) =>
    tx.tickets.updateTicketCas(t.id, t.status_version, { tier_predicted: tier }),
  );
}

/** Overrides company Director settings for the rest of the test (`escalation`, `approval_mode`, ...). */
export async function overrideDirector(
  rig: Rig,
  director: Record<string, unknown>,
): Promise<void> {
  const current = await rig.config.company();
  await rig.config.append({
    scope: 'company',
    doc: { director },
    author: 'test',
    reason: 'escalation scenario',
    expectedVersion: current.version,
  });
}
