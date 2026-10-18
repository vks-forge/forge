/**
 * Rework wakes: asking the Worker (or each Worker of a writer group) to take the work back.
 *
 * Why: when a stage sends work back, the findings or the owner's comment travel in a durable
 *   `continuation` wake, so the next prompt carries them even if the server restarts in between.
 *   When the stage the work goes back to is a group of writers, every member must redo its part
 *   (a finding may touch any of them, d-0076), and each member is placed by the scheduler on its
 *   own against the Worker limits, so there is one wake per member (`~member` after the key) and
 *   all of them carry the same words. A lone writer gets the single wake it always had.
 *
 * Exports: requestReworkWakesTx().
 * Depends on: @forge/core (classifyStage, reworkTarget), tick/wakes. Writes inside the caller's transaction.
 */

import { classifyStage, reworkTarget } from '@forge/core';
import type { StorageTx } from '@forge/core';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineDeps } from '#/types/engine.types.js';

/**
 * Queues the continuation wake(s) for work sent back from `fromStageId`: one wake, or one per
 * member when the stage the next cycle restarts at is a group of writers.
 */
export async function requestReworkWakesTx(
  deps: EngineDeps,
  tx: StorageTx,
  ticketId: string,
  fromStageId: string,
  reason: string,
  key: string,
): Promise<void> {
  const snapshot = await tx.ticketPipelines.get(ticketId);
  const targetId = snapshot ? reworkTarget(snapshot, fromStageId) : undefined;
  const target = snapshot?.definition.stages.find((s) => s.id === targetId);
  if (
    snapshot &&
    target?.kind === 'group' &&
    classifyStage(target, snapshot.roles) === 'writer_group'
  ) {
    for (const m of target.members) {
      await requestWakeTx(tx, deps, {
        ticketId,
        kind: 'continuation',
        reason,
        key: `${key}~${m.id}`,
      });
    }

    return;
  }

  await requestWakeTx(tx, deps, { ticketId, kind: 'continuation', reason, key });
}
