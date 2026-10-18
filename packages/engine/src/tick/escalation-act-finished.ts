/**
 * The owner's actions on finished work and on held tickets: merge anyway, continue, send back, approve, sign off.
 *
 * Why: these are the choices a check or the Director's finished work leaves with the owner (d-0135),
 *   and each is a deliberate act: merge anyway and continue overrule a hold on the record
 *   (tick/escalation-override), send back settles the item and returns the ticket to its Worker in
 *   one transaction (so a crash leaves either the whole action or none), and approve or sign off
 *   settles the sign-off item in the transaction that merges and moves the ticket to done
 *   (tick/review-merge). They are the same through the item's door and the ticket's own door, which
 *   is why they live in one place; the checks that an action is offered and that only the owner
 *   takes the overruling ones are in tick/escalation-act.
 *
 * Exports: actOnFinished(), sendBackItem(), ended(), refusesAuthor().
 * Depends on: @forge/core (escalation types), tick/{escalation-effects,escalation-override,escalation-settle,
 *   review-merge}, types/escalation. Writes storage.
 */

import { toEscalation } from '@forge/core';
import type { EscalationActBody, Interaction, Ticket } from '@forge/core';
import { reworkTx } from '#/tick/escalation-effects.js';
import { overrideTx } from '#/tick/escalation-override.js';
import { settleEscalation } from '#/tick/escalation-settle.js';
import { approveAndMerge } from '#/tick/review-merge.js';
import { iso } from '#/shared/time.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { ActOutcome, EffectEnd } from '#/types/escalation.types.js';

/** Maps how an effect ended onto the outcome the routes know. */
export const ended = (end: EffectEnd, interaction: Interaction | null): ActOutcome =>
  end === 'done'
    ? { status: 'done', interaction }
    : end === 'stale'
      ? { status: 'stale' }
      : { status: 'not_pending' };

/** Raised inside a transaction to roll it back when the ticket is no longer where the action needs it. */
const STALE = new Error('stale');

/** Settles the item `row` and sends its ticket back to the Worker with `comment`, in one transaction. */
export async function sendBackItem(
  deps: EngineDeps,
  nowIso: string,
  row: Interaction,
  ticket: Ticket,
  comment: string,
  author: string,
): Promise<EffectEnd> {
  try {
    return await deps.storage.transaction(async (tx) => {
      const settled = await settleEscalation(
        tx,
        nowIso,
        row.card_id === undefined ? { ...row, card_id: ticket.card_id } : row,
        { action: 'rework', by: 'owner', comment },
        author,
      );

      if (!settled) {
        return 'not_pending';
      }

      if (!(await reworkTx(deps, tx, nowIso, ticket.id, comment))) {
        throw STALE;
      }

      return 'done';
    });
  } catch (e) {
    if (e === STALE) {
      return 'stale';
    }

    throw e;
  }
}

/** Actions only the owner may take, and the author names that are not the owner (the Director, the engine, automatic actions). */
const OWNER_ONLY: readonly string[] = ['merge_anyway', 'continue', 'approve', 'sign_off'];
const NOT_OWNER: readonly string[] = ['director', 'engine', 'auto'];

/** True when `author` may not take `action`: overruling a hold and signing finished work are the owner's alone. */
export const refusesAuthor = (action: string, author: string): boolean =>
  OWNER_ONLY.includes(action) && NOT_OWNER.includes(author.trim().toLowerCase());

/**
 * Settles the finished-work or hold action `body` on the pending item `row` of `ticket`. The caller
 * already checked that the action is offered and that the author may take it.
 */
export async function actOnFinished(
  deps: EngineDeps,
  state: EngineState,
  row: Interaction,
  ticket: Ticket,
  body: EscalationActBody,
  author: string,
): Promise<ActOutcome> {
  const nowIso = iso(deps.clock.now());
  const view = toEscalation(row);
  const reload = (): Promise<Interaction | null> =>
    deps.storage.transaction((tx) => tx.interactions.get(row.id));

  switch (body.action) {
    case 'merge_anyway':
    case 'continue': {
      if (view.payload.kind !== 'decision') {
        return { status: 'action_not_offered' };
      }

      const end = await deps.storage.transaction((tx) =>
        overrideTx(tx, nowIso, row, body.action, body.comment, author),
      );

      return ended(end, await reload());
    }

    case 'rework': {
      if (view.payload.kind !== 'decision' && view.payload.kind !== 'sign_off') {
        return { status: 'action_not_offered' };
      }

      return ended(
        await sendBackItem(deps, nowIso, row, ticket, body.comment, author),
        await reload(),
      );
    }

    case 'approve':
    case 'sign_off': {
      if (view.payload.kind !== 'sign_off') {
        return { status: 'action_not_offered' };
      }

      const signer = body.action === 'sign_off' ? (body.signer ?? author) : undefined;

      return approveAndMerge(deps, state, ticket, signer, row, author);
    }

    default:
      return { status: 'action_not_offered' };
  }
}
