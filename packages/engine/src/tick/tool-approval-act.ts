/**
 * The owner's answer to a tool approval: allow once, always for this project, or deny.
 *
 * Why: this is consent, so it is the owner's alone (the Director and automatic actions are
 *   refused before it runs) and it settles exactly once. "Always for this project" first stores
 *   the narrow rule the owner was shown as a new version of the project's settings (author,
 *   reason and the ticket it came from are on the row, so Settings can show and revoke it), and
 *   only then settles the item with that settings version: a settle that fails never leaves the
 *   owner thinking a rule exists, and a settle that loses after the save leaves a visible rule,
 *   never a hidden one. The save is a compare-and-swap that retries a few times when another
 *   editor saved first. When the last unanswered item of a run is answered and the ticket is
 *   waiting, one wake resumes the same session with every answer; a run that is still live
 *   will be parked by its own settle instead (tick/approval-park, d-0175, execution-plane.md §6).
 *
 * Exports: actOnToolApproval().
 * Depends on: @forge/core (escalation schemas, ConfigVersionConflictError, config source), tick/{approval-wake,
 *   card-log,escalation-settle,wakes}, shared/time, types/{engine,escalation}. Writes storage and settings.
 */

import { ConfigVersionConflictError, toEscalation } from '@forge/core';
import type {
  ApprovedToolRule,
  EscalationActBody,
  EscalationAnswer,
  Interaction,
  ProjectOverride,
  Ticket,
} from '@forge/core';
import { iso } from '#/shared/time.js';
import { pendingApprovalsOfRun, permWakeKey } from '#/tick/approval-wake.js';
import { logCardEvent } from '#/tick/card-log.js';
import { settleEscalation } from '#/tick/escalation-settle.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { ActOutcome } from '#/types/escalation.types.js';

const SAVE_ATTEMPTS = 3;

/** The id a project's `approved` rule gets: stable per approval, so a retried save is recognised. */
const ruleIdFor = (interactionId: string): string => `approved-${interactionId}`;

/**
 * Appends the rule to the project's settings as the next version and returns that version.
 * Idempotent per approval (a rule already stored for it is not added twice); gives up as
 * `null` after the attempts when other saves keep winning.
 */
async function storeAlwaysRule(
  deps: EngineDeps,
  ticket: Ticket,
  row: Interaction,
  rule: ApprovedToolRule,
  author: string,
): Promise<number | null> {
  const slug =
    (await deps.storage.transaction((tx) => tx.projects.get(ticket.project)))?.slug ??
    ticket.project;

  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
    const last = (await deps.config.history('project', slug)).at(-1);
    const doc: ProjectOverride = last?.scope === 'project' ? last.doc : {};
    const approved = doc.tool_grants?.approved ?? [];
    if (last && approved.some((r) => r?.id === rule.id)) {
      return last.version;
    }

    try {
      const saved = await deps.config.append({
        scope: 'project',
        project: slug,
        doc: {
          ...doc,
          tool_grants: { ...doc.tool_grants, approved: [...approved, rule] },
        },
        author,
        reason: `Always allowed from ${ticket.id} (${row.id})`,
        expectedVersion: last?.version ?? 0,
      });

      return saved.version;
    } catch (e) {
      if (!(e instanceof ConfigVersionConflictError)) {
        throw e;
      }
    }
  }

  return null;
}

/**
 * Settles the pending permission item `row` of `ticket` with `body`; the caller checked that the
 * action is offered and that the author is the owner. Other kinds of item are not its business.
 */
export async function actOnToolApproval(
  deps: EngineDeps,
  row: Interaction,
  ticket: Ticket,
  body: EscalationActBody,
  author: string,
): Promise<ActOutcome> {
  const view = toEscalation(row);
  if (
    view.payload.kind !== 'permission' ||
    (body.action !== 'allow_once' &&
      body.action !== 'allow_always' &&
      body.action !== 'deny')
  ) {
    return { status: 'action_not_offered' };
  }

  const nowIso = iso(deps.clock.now());
  let answer: EscalationAnswer = { action: body.action, by: 'owner' };
  if (body.action === 'deny' && body.note !== undefined && body.note !== '') {
    answer = { ...answer, note: body.note };
  }

  if (body.action === 'allow_always') {
    const offer = view.payload.always;
    if (!offer.offered || offer.rule === undefined) {
      return { status: 'action_not_offered' };
    }

    const version = await storeAlwaysRule(
      deps,
      ticket,
      row,
      {
        id: ruleIdFor(row.id),
        action: offer.rule.action,
        resource: offer.rule.resource,
        effect: 'allow',
        created_at: nowIso,
        source: { ticket_id: ticket.id, interaction_id: row.id },
      },
      author,
    );

    if (version === null) {
      return { status: 'stale' };
    }

    answer = { ...answer, settings_version: version };
  }

  const won = await deps.storage.transaction(async (tx) => {
    const target = row.card_id === undefined ? { ...row, card_id: ticket.card_id } : row;
    if (!(await settleEscalation(tx, nowIso, target, answer, author))) {
      return false;
    }

    await logCardEvent(tx, target.card_id, {
      kind: 'interaction_answered',
      at: nowIso,
      actor: { type: 'user', id: author },
      payload: { ticket_id: ticket.id, interaction_id: row.id },
    });

    // The last answer of a parked run wakes it once; a run still live is parked by its own settle.
    const current = await tx.tickets.get(ticket.id);
    if (
      row.run_id !== undefined &&
      current?.status === 'waiting_human' &&
      (await pendingApprovalsOfRun(tx, ticket.id, row.run_id)).length === 0
    ) {
      await requestWakeTx(tx, deps, {
        ticketId: ticket.id,
        kind: 'response_wake',
        reason: 'answered',
        key: permWakeKey(row.run_id),
      });
    }

    return true;
  });

  if (!won) {
    return { status: 'not_pending' };
  }

  return {
    status: 'done',
    interaction: await deps.storage.transaction((tx) => tx.interactions.get(row.id)),
  };
}
