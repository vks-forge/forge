/**
 * Run-scoped helpers: load the active run, append run events, raise interactions.
 *
 * Why: every state-writing tool must (a) act only for a run that is still `running`,
 *   (b) append to the run's event log with a fresh sequence number, and (c) for
 *   questions, store an `interactions` row the Director's tick can find. Doing it in one
 *   place keeps the log gap-free and means no tool can write for a run the Director has
 *   already settled.
 *
 * Exports: loadActiveRun(), appendRunEvent(), raiseInteraction(), DEFAULT_INTERACTION_TIMEOUT_MS.
 * Depends on: @forge/core, types/deps.types. IO: storage transactions.
 */

import { PolicyDeniedError } from '@forge/core';
import type { RunEvent, StorageAdapter, StorageTx } from '@forge/core';
import type { ToolContext } from '#/types/deps.types.js';

/** Matches the Director's default wait before a parked ticket becomes Blocked (director-core.md §8). */
export const DEFAULT_INTERACTION_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** The run row, or a PolicyDeniedError when it is missing or no longer `running`. */
export async function loadActiveRun(storage: StorageAdapter, runId: string) {
  const run = await storage.transaction((tx) => tx.runs.get(runId));
  if (!run) throw new PolicyDeniedError(`run ${runId} does not exist`);
  if (run.status !== 'running' || run.ended_at !== undefined)
    throw new PolicyDeniedError(`run ${runId} is not running (status: ${run.status})`);
  return run;
}

/** Appends one event to the run log inside `tx`, at the next free sequence number. */
export async function appendRunEvent(
  tx: StorageTx,
  ctx: ToolContext,
  build: (seq: number, ts: string) => RunEvent,
): Promise<RunEvent> {
  const existing = await tx.runEvents.listByRun(ctx.run.id);
  const seq = existing.reduce((max, e) => Math.max(max, e.seq), -1) + 1;
  const event = build(seq, ctx.now().toISOString());
  await tx.runEvents.append(ctx.run.id, event);
  return event;
}

/**
 * Stores a pending `question` interaction plus the matching `ask` event atomically and
 * returns the interaction id. The ticket status stays the Director's to change.
 */
export async function raiseInteraction(
  ctx: ToolContext,
  payload: Record<string, unknown>,
  prompt: string,
): Promise<string> {
  const id = `int-${ctx.newId()}`;
  const asked = ctx.now();
  const timeout = ctx.deps.interactionTimeoutMs ?? DEFAULT_INTERACTION_TIMEOUT_MS;
  await ctx.deps.storage.transaction(async (tx) => {
    await tx.interactions.insert({
      id,
      ticket_id: ctx.run.ticket_id,
      run_id: ctx.run.id,
      kind: 'question',
      payload,
      status: 'pending',
      asked_at: asked.toISOString(),
      timeout_at: new Date(asked.getTime() + timeout).toISOString(),
    });
    await appendRunEvent(tx, ctx, (seq, ts) => ({
      type: 'ask',
      seq,
      ts,
      interaction_id: id,
      kind: 'question',
      prompt,
    }));
  });
  return id;
}
