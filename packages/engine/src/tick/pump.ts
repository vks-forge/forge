/**
 * Run pump: drains one live run's event stream into storage.
 *
 * Why: a Worker run is a stream of events (tool calls, text, questions) followed by one
 *   result. The Director needs the stream stored (the control room and replay read it) and
 *   needs to know the run is alive: every event stamps `last_event_at`, which is the only
 *   thing the stall check looks at. Each event also asks for a tick so a finished run or a
 *   question is acted on in seconds, not at the next 30 s beat. One pump per live run; it
 *   never decides anything, the tick settles the run once the pump says it is done.
 *
 * Exports: startPump(), pumpResult().
 * Depends on: @forge/core (RunEvent, WorkerDriver port), tick/tick-requests, shared/time.
 */

import type { NewRunEvent, RunEvent, RunHandle, RunResult } from '@forge/core';
import { failureResult, familyOf } from '#/domain/results.js';
import { iso } from '#/shared/time.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineState, Pump } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

async function record(deps: EngineDeps, pump: Pump, event: RunEvent): Promise<void> {
  if (event.type === 'ask') {
    pump.asks.set(event.interaction_id, { kind: event.kind, prompt: event.prompt });
  }

  const { seq: _seq, ...rest } = event;
  void _seq;
  try {
    await deps.storage.transaction(async (tx) => {
      await tx.runEvents.append(pump.runId, rest as NewRunEvent);
      await tx.runs.update(pump.runId, { last_event_at: iso(deps.clock.now()) });
    });
  } catch (e) {
    // A lost event is a hole in the replay, not a reason to kill the run.
    deps.log?.('warn', `could not store event for ${pump.runId}`, { error: String(e) });
  }
}

/** Starts the pump for a freshly started run and registers it in `state.pumps`. */
export function startPump(
  deps: EngineDeps,
  state: EngineState,
  runId: string,
  handle: RunHandle,
): Pump {
  const pump: Pump = {
    runId,
    handle,
    done: false,
    asks: new Map(),
    finished: Promise.resolve(),
  };

  pump.finished = (async () => {
    try {
      for await (const event of deps.driver.events(handle)) {
        await record(deps, pump, event);
        requestTick(deps, state);
      }

      pump.result = await deps.driver.result(handle);
    } catch (e) {
      pump.error = e;
    } finally {
      pump.done = true;
      requestTick(deps, state);
    }
  })();

  state.pumps.set(runId, pump);

  return pump;
}

/** The result a pump's run settles with: the driver's, or a synthesized failure when the stream broke. */
export function pumpResult(pump: Pump): RunResult {
  return pump.result ?? failureResult(familyOf(pump.error), pump.handle.session ?? null);
}
