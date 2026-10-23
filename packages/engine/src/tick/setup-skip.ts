/**
 * Start without setup: the owner's answer when a worktree's install keeps failing.
 *
 * Why: some projects cannot install on this machine (a private registry, a tool that is not
 *   there) and the owner still wants the Worker to try. "Start without setup" stores a `skipped`
 *   record for the tree as its setup plan stands now, so the next prepare of the same plan and the
 *   same input files counts as done and runs nothing, then releases the ticket like a retry. The
 *   record is keyed like a real one: if the owner later changes the steps or the Worker changes
 *   the lockfile, setup is tried again. The card says the owner skipped it, so a later failing
 *   check is not a mystery.
 *
 * Exports: skipSetup().
 * Depends on: @forge/core (branchName, escalation schemas), tick/{card-log,escalation-effects,project-runtime},
 *   types/{engine,escalation}. Writes the prep record through the worktree ports and storage.
 */

import { branchName, toEscalation } from '@forge/core';
import type { Interaction, Ticket } from '@forge/core';
import { iso } from '#/shared/time.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { retryTx } from '#/tick/escalation-effects.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { ActOutcome } from '#/types/escalation.types.js';

/** Stores the `skipped` record for `ticket`'s worktree, then releases the ticket; the answer is `skip_setup`. */
export async function skipSetup(
  deps: EngineDeps,
  row: Interaction,
  ticket: Ticket,
  author: string,
): Promise<ActOutcome> {
  const { payload } = toEscalation(row);
  if (payload.kind !== 'setup' || payload.cause.type !== 'worktree_setup') {
    return { status: 'action_not_offered' };
  }

  const view = await deps.config.project(ticket.project).catch(() => undefined);
  const base = deps.project(ticket.project, view);
  const prepare = base?.prepare;
  if (!base || !prepare) {
    return { status: 'stale' };
  }

  const runtime = { ...base, config: { ...base.config, ...view?.config.project } };
  try {
    const wt = await runtime.worktrees.create(
      ticket.id,
      ticket.branch ?? branchName(ticket.type, ticket.id, ticket.title),
      runtime.config.git_host?.base_branch ?? runtime.baseRef,
    );

    await prepare.skip(wt.path, await prepare.plan(wt.path, runtime.config));
  } catch (e) {
    return {
      status: 'invalid_answer',
      reason: `could not skip setup: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const nowIso = iso(deps.clock.now());
  const end = await deps.storage.transaction(async (tx) => {
    const out = await retryTx(
      deps,
      tx,
      nowIso,
      row,
      { action: 'skip_setup', by: 'owner' },
      author,
    );

    if (out === 'done') {
      await logCardEvent(tx, ticket.card_id, {
        kind: 'note',
        at: nowIso,
        actor: ENGINE_ACTOR,
        payload: { text: `${ticket.id} workspace: setup skipped by owner` },
      });
    }

    return out;
  });

  const interaction = await deps.storage.transaction((tx) => tx.interactions.get(row.id));
  if (end === 'done') {
    return { status: 'done', interaction };
  }

  return end === 'stale' ? { status: 'stale' } : { status: 'not_pending' };
}
