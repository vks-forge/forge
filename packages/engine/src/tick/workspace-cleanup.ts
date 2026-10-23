/**
 * Workspace cleanup: remove a finished-with ticket's worktree and branch, close its PR, once.
 *
 * Why: a worktree holds an install folder of 150 MB or more, and a cancelled or replaced
 *   ticket's branch is work nobody wants (the card log and the receipts keep the history). Left
 *   behind they pile up per ticket, and a re-planned card keeps stale trees and branches the owner
 *   then has to find by hand. Every path that ends a ticket without merging (the owner's cancel,
 *   a plan that replaces its tickets, the sweep after a restart) goes through this one helper, so a
 *   failed removal (a locked file on Windows) is retried the same way by the next start and the
 *   ticket remembers its folder until the removal worked. A cancelled ticket's open PR is closed
 *   and its pushed branch deleted too (d-0179), so the owner's repository host does not keep dead
 *   PRs; these two are best effort (a host that is down must not block the cancel) and never
 *   forced. A merged PR is left alone. Before anything goes, the last commit id is read and put on
 *   the card's history so the work can be recovered with `git branch <name> <sha>` until git
 *   collects it.
 *
 * Exports: cleanWorkspace(), sweepCancelledWorkspaces() (also run by the tick after a failed removal).
 * Depends on: @forge/core (TERMINAL_STATUSES, GitHost), shared/time, tick/card-log, tick/ticket-moves, types/{engine,engine-state}.
 *   IO through the worktree and git host ports and storage.
 */

import type { GitHost, Ticket } from '@forge/core';
import { iso } from '#/shared/time.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** At most this many leftover workspaces are cleaned per start, so a long history cannot stall the first tick. */
const SWEEP_LIMIT = 50;

/** Closes the ticket's PR unless it is already merged or closed; true when the PR is now closed. Never throws. */
async function closeOpenPr(
  deps: EngineDeps,
  host: GitHost,
  ticket: Ticket,
): Promise<number | undefined> {
  if (ticket.pr_number === undefined) {
    return undefined;
  }

  try {
    const status = await host.prStatus(ticket.pr_number);
    if (status.state !== 'open') {
      return undefined;
    }

    await host.closePr(ticket.pr_number);

    return ticket.pr_number;
  } catch (e) {
    deps.log?.('warn', `could not close PR ${ticket.pr_number} of ${ticket.id}`, {
      error: String(e),
    });

    return undefined;
  }
}

/** Deletes the ticket's branch on the host (idempotent, never the base); true when it went. Never throws. */
async function deleteHostBranch(
  deps: EngineDeps,
  host: GitHost,
  ticket: Ticket,
): Promise<boolean> {
  if (ticket.branch === undefined) {
    return false;
  }

  try {
    await host.deleteBranch(ticket.branch);

    return true;
  } catch (e) {
    deps.log?.('warn', `could not delete branch ${ticket.branch} of ${ticket.id}`, {
      error: String(e),
    });

    return false;
  }
}

/** One card line saying what was cleaned and the commit the work can be recovered from. */
async function noteCleanup(
  deps: EngineDeps,
  ticket: Ticket,
  done: {
    readonly pr: number | undefined;
    readonly branch: boolean;
    readonly sha: string | undefined;
  },
): Promise<void> {
  const parts: string[] = [];
  if (done.pr !== undefined) {
    parts.push(`closed PR #${done.pr}`);
  }

  if (done.branch && ticket.branch !== undefined) {
    parts.push(`deleted branch ${ticket.branch}`);
  }

  if (parts.length === 0 && done.sha === undefined) {
    return;
  }

  const kept =
    done.sha === undefined
      ? ''
      : ` Last commit ${done.sha}: \`git branch recovered ${done.sha}\` brings the work back.`;

  await deps.storage
    .transaction((tx) =>
      logCardEvent(tx, ticket.card_id, {
        kind: 'note',
        at: iso(deps.clock.now()),
        actor: ENGINE_ACTOR,
        payload: {
          text: `Cleaned up ${ticket.id}: ${parts.join(', ') || 'removed its folder'}.${kept}`,
        },
      }),
    )
    .catch((e: unknown) => {
      deps.log?.('warn', `could not note the cleanup of ${ticket.id}`, {
        error: String(e),
      });
    });
}

/**
 * Removes `ticket`'s worktree and branches, closes its open PR and forgets any preparation job. True when nothing
 * is left (or there never was a folder); false when the removal failed and will be retried by the
 * next start's sweep. Never throws.
 */
export async function cleanWorkspace(
  deps: EngineDeps,
  state: EngineState,
  ticket: Ticket,
): Promise<boolean> {
  const job = state.prepJobs.get(ticket.id);
  state.prepJobs.delete(ticket.id);
  const path = ticket.worktree ?? job?.worktree;
  if (path === undefined) {
    return true;
  }

  const settings = await deps.config.project(ticket.project).catch(() => undefined);
  const runtime = deps.project(ticket.project, settings);
  if (!runtime) {
    return false;
  }

  // Read before anything is removed: this is the id the owner can recover the work from.
  const sha = await runtime.worktrees.head(path).catch(() => undefined);
  const host = runtime.gitHost;
  const closedPr = host ? await closeOpenPr(deps, host, ticket) : undefined;

  try {
    await runtime.worktrees.remove(
      path,
      ticket.branch === undefined ? undefined : { deleteBranch: ticket.branch },
    );
  } catch (e) {
    deps.log?.('warn', `could not remove worktree of ${ticket.id}`, { error: String(e) });
    state.cleanupPending = true;

    return false;
  }

  // After the folder: a branch still checked out in a worktree would be deleted under it.
  const branchGone = host ? await deleteHostBranch(deps, host, ticket) : false;
  await noteCleanup(deps, ticket, { pr: closedPr, branch: branchGone, sha });

  // The folder is gone: forget it, so the sweep after a restart does not look again.
  await moveTicket(deps.storage, ticket.id, iso(deps.clock.now()), (t) =>
    t.worktree === undefined ? null : { events: [], fields: { worktree: undefined } },
  );

  return true;
}

/** First tick: retries the removal for cancelled tickets that still name a worktree (a failed removal, a crash mid-cancel). */
export async function sweepCancelledWorkspaces(ctx: EngineCtx): Promise<number> {
  const { deps, state } = ctx;
  const leftovers = (
    await deps.storage.transaction((tx) => tx.tickets.listByStatus('cancelled'))
  )
    .filter((t) => t.worktree !== undefined)
    .slice(0, SWEEP_LIMIT);

  let cleaned = 0;
  for (const ticket of leftovers) {
    if (await cleanWorkspace(deps, state, ticket)) {
      cleaned += 1;
    }
  }

  return cleaned;
}
