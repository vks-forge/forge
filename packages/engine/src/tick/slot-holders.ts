/**
 * Slot holders: which tickets occupy the Worker slots a waiting ticket is queued behind.
 *
 * Why: "Waiting for a Worker slot" tells the owner nothing; "FX-2 is working" says where to
 *   look and that the wait will end. The holders are the tickets with a live run, a worktree
 *   being prepared or a brief being written (the same three the scheduler counts as running),
 *   narrowed to the limit that actually blocked the ticket (its project, its harness, or all).
 *
 * Exports: slotHolders(), holdersOf().
 * Depends on: @forge/core (StorageTx), types/engine-state, types/pick-next, types/wait-text.
 *   IO: reads storage inside the caller's transaction.
 */

import type { StorageTx } from '@forge/core';
import type { EngineState } from '#/types/engine-state.types.js';
import type { WaitReason } from '#/types/pick-next.types.js';
import type { SlotHolder } from '#/types/wait-text.types.js';

/** Every ticket occupying a Worker slot now: live runs, then workspaces being prepared, then briefs being written. */
export async function slotHolders(
  tx: StorageTx,
  state: EngineState,
  projectOf: (id: string) => Promise<string>,
): Promise<SlotHolder[]> {
  const holders = new Map<string, SlotHolder>();
  for (const r of await tx.runs.listByStatus(['starting', 'running'])) {
    holders.set(r.ticket_id, {
      id: r.ticket_id,
      project: r.project ?? (await projectOf(r.ticket_id)),
      harness: r.harness,
      doing: 'working',
    });
  }

  for (const job of state.prepJobs.values()) {
    if (job.outcome === undefined && !holders.has(job.ticketId)) {
      holders.set(job.ticketId, {
        id: job.ticketId,
        project: await projectOf(job.ticketId),
        harness: '',
        doing: 'getting_ready',
      });
    }
  }

  for (const [id, b] of state.briefing) {
    if (!holders.has(id)) {
      holders.set(id, {
        id,
        project: b.project,
        harness: b.harness,
        doing: 'being_briefed',
      });
    }
  }

  return [...holders.values()];
}

/** The holders a `cap` wait names: those inside the limit's scope, never the ticket itself. */
export function holdersOf(
  wait: Extract<WaitReason, { kind: 'cap' }>,
  all: readonly SlotHolder[],
  self: string,
  project: string,
): SlotHolder[] {
  return all.filter((h) => {
    if (h.id === self) {
      return false;
    }

    switch (wait.scope) {
      case 'project':
        return h.project === (wait.name ?? project);
      case 'harness':
        return h.harness === wait.name;
      default:
        return true;
    }
  });
}
