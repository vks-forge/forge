/**
 * Publish: commit the worktree, push the branch, open the PR once.
 *
 * Why: gates and reviewers judge a branch on the git host, and Workers never push
 *   (d-0012), so the Director publishes what a finished run left in its worktree. The PR
 *   number is stored on the ticket the moment the host returns it, before any gate runs:
 *   a crash after that point finds the PR on the next tick and only pushes again. A crash
 *   between the host opening the PR and that store is covered by asking the host for the
 *   branch's open PR first, so one ticket never opens two PRs. A rework run reuses the same branch and PR; the push
 *   updates it.
 *
 * Exports: publishBranch().
 * Depends on: tick/ticket-moves, types/verify. IO only through worktrees and GitHost ports.
 */

import type { Ticket } from '@forge/core';
import { moveTicket } from '#/tick/ticket-moves.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { VerifyTarget } from '#/types/verify.types.js';

/** Commits, pushes and (first time only) opens the PR; returns the ticket as stored afterwards. */
export async function publishBranch(ctx: EngineCtx, t: VerifyTarget): Promise<Ticket> {
  const { deps } = ctx;
  const { ticket, runtime } = t;
  const title = `${ticket.type}(${ticket.id}): ${ticket.title}`;

  // Null means nothing new to commit (a rework that changed nothing, or a retry of this step).
  await deps.worktrees.commitAll(t.worktree, title);
  await runtime.gitHost.push(t.worktree, t.branch);
  if (ticket.pr_number !== undefined) {
    return ticket;
  }

  // A crash after `openPr` returned but before the CAS below leaves a PR the ticket does
  // not know; ask the host first so that PR is adopted instead of duplicated.
  const pr =
    (await runtime.gitHost.findPr(t.branch)) ??
    (await runtime.gitHost.openPr({
      branch: t.branch,
      base: t.baseRef,
      title,
      body: `${ticket.body}

Forge ticket ${ticket.id}, run ${t.run.id}.`,
    }));

  const moved = await moveTicket(deps.storage, ticket.id, ctx.nowIso, () => ({
    events: [],
    fields: { pr_number: pr.number, pr_url: pr.url },
  }));

  if (!moved.ok) {
    deps.log?.('error', `PR ${pr.number} found but not stored on ${ticket.id}`, {
      reason: moved.reason,
    });

    throw new Error(`could not store PR ${pr.number} on ${ticket.id}: ${moved.reason}`);
  }

  deps.log?.('info', `stored PR ${pr.number} for ${ticket.id}`, { url: pr.url });

  return moved.ticket;
}
