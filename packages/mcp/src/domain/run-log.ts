/**
 * Run-scoped helpers: load the active run, append run events, raise interactions.
 *
 * Why: every state-writing tool must (a) act only for a run that is still active (`isRunActive`, the same rule the hook uses),
 *   (b) append to the run's event log (storage allocates the sequence number), and (c) for
 *   questions, store an `interactions` row the Director's tick can find. Doing it in one
 *   place keeps the log gap-free and means no tool can write for a run the Director has
 *   already settled. A run may hold only one pending interaction at a time.
 *
 * Exports: loadActiveRun(), appendRunEvent(), raiseInteraction(), DEFAULT_INTERACTION_TIMEOUT_MS.
 * Depends on: @forge/core, types/deps.types. IO: storage transactions.
 */

import { PolicyDeniedError, isRunActive } from '@forge/core';
import type {
  InteractionKind,
  NewRunEvent,
  RunEvent,
  StorageAdapter,
  StorageTx,
} from '@forge/core';
import type { ToolContext } from '#/types/deps.types.js';

/** Matches the Director's default wait before a parked ticket becomes Blocked (director-core.md §8). */
export const DEFAULT_INTERACTION_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** The run row, or a PolicyDeniedError when it is missing or no longer `running`. */
export async function loadActiveRun(storage: StorageAdapter, runId: string) {
  const run = await storage.transaction((tx) => tx.runs.get(runId));
  if (!run) throw new PolicyDeniedError(`run ${runId} does not exist`);
  if (!isRunActive(run))
    throw new PolicyDeniedError(`run ${runId} is not running (status: ${run.status})`);
  return run;
}

/**
 * Appends one event to the run log inside `tx` and returns it as stored. `seq` is not
 * chosen here: storage numbers the event, so this server and the driver can write to the
 * same run without colliding.
 */
export function appendRunEvent(
  tx: StorageTx,
  ctx: ToolContext,
  build: (ts: string) => NewRunEvent,
): Promise<RunEvent> {
  return tx.runEvents.append(ctx.run.id, build(ctx.now().toISOString()));
}

/**
 * Stores a pending `question` or `blocked` interaction plus the matching `ask` event atomically and
 * returns the interaction id. The ticket status stays the Director's to change.
 */
export async function raiseInteraction(
  ctx: ToolContext,
  kind: Extract<InteractionKind, 'question' | 'blocked'>,
  payload: Record<string, unknown>,
  prompt: string,
): Promise<string> {
  const id = `int-${ctx.newId()}`;
  const asked = ctx.now();
  const timeout = ctx.deps.interactionTimeoutMs ?? DEFAULT_INTERACTION_TIMEOUT_MS;
  await ctx.deps.storage.transaction(async (tx) => {
    // One open question per run: a Worker that loops on ask_director would otherwise flood
    // the Director and the human with parked interactions.
    const open = (await tx.interactions.listPending()).some(
      (i) => i.run_id === ctx.run.id,
    );
    if (open)
      throw new PolicyDeniedError(
        'this run already has a pending question or blocker; stop working and wait for the answer',
      );
    await tx.interactions.insert({
      id,
      ticket_id: ctx.run.ticket_id,
      run_id: ctx.run.id,
      kind,
      payload,
      status: 'pending',
      asked_at: asked.toISOString(),
      timeout_at: new Date(asked.getTime() + timeout).toISOString(),
    });
    await appendRunEvent(tx, ctx, (ts) => ({
      type: 'ask',
      ts,
      interaction_id: id,
      kind,
      prompt,
    }));
  });
  return id;
}
