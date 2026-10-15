/**
 * Direct steer: a person's message to one live Worker, delivered at once.
 *
 * Why: d-0109 lets the user message a Worker from its ticket page. Unlike a chat reply
 *   (which waits for a tick and a Director step to pick the wording), this is the person's own
 *   instruction and must reach the Worker as written, now. The message is written to the
 *   durable run inbox and to the run's event stream in one transaction, so a crash never loses
 *   it and every live viewer sees it before the Worker reacts, then handed to the driver with
 *   its inbox sequence and marked delivered only once the driver took it. Only a run with a
 *   live pump in this process can be steered; only the `steer` mode is used, and only when the
 *   driver declares it, because falling back to a queued follow-up would silently change what
 *   the person asked for. If the driver refuses, the message stays visibly undelivered.
 *
 * Exports: steerRun().
 * Depends on: @forge/core (RunStatus, WorkerDriver port), shared/time, types/engine,
 *   types/engine-state. IO only through the engine ports.
 */

import { InvalidInputError } from '@forge/core';
import type { RunStatus } from '@forge/core';
import { iso } from '#/shared/time.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps, SteerRunResult } from '#/types/engine.types.js';

/** Run statuses that can take a message: the harness session is alive. */
const STEERABLE: readonly RunStatus[] = ['starting', 'running'];

/** Delivers `text` from `author` to the live run `runId`; see the file header for the refusals. */
export async function steerRun(
  deps: EngineDeps,
  state: EngineState,
  runId: string,
  text: string,
  author: string,
): Promise<SteerRunResult> {
  const pump = state.pumps.get(runId);
  if (!pump || pump.done || pump.interrupted || pump.cancelled) {
    return { status: 'not_live' };
  }

  if (!pump.driver.capabilities().steerModes.includes('steer')) {
    return { status: 'unsupported' };
  }

  const at = iso(deps.clock.now());
  const stored = await deps.storage.transaction(async (tx) => {
    const run = await tx.runs.get(runId);
    if (!run || run.owner !== deps.owner || !STEERABLE.includes(run.status)) {
      return null;
    }

    const msg = await tx.runInbox.append({ run_id: runId, mode: 'steer', author, text });
    await tx.runEvents.append(runId, {
      type: 'user_message',
      ts: at,
      inbox_seq: msg.seq,
      mode: 'steer',
      author,
      text,
    });

    return msg;
  });

  if (!stored) {
    return { status: 'not_live' };
  }

  try {
    await pump.driver.steer(pump.handle, text, 'steer', stored.seq);
  } catch (e) {
    if (e instanceof InvalidInputError) {
      // The run ended between the check and the send, or the live session does not take it.
      return { status: pump.done ? 'not_live' : 'unsupported' };
    }

    throw e;
  }

  await deps.storage.transaction((tx) =>
    tx.runInbox.markDelivered(runId, stored.seq, iso(deps.clock.now())),
  );

  deps.log?.('info', `steer delivered to ${runId}`, { author, inboxSeq: stored.seq });

  return { status: 'delivered', inboxSeq: stored.seq };
}
