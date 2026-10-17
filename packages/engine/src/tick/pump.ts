/**
 * Run pump: drains one live run's event stream into storage.
 *
 * Why: a Worker run is a stream of events (tool calls, text, questions) followed by one
 *   result. The Director needs the stream stored (the control room and replay read it) and
 *   needs to know the run is alive: every event stamps `last_event_at`, which is the only
 *   thing the stall check looks at. Each event also asks for a tick so a finished run or a
 *   question is acted on in seconds, not at the next 30 s beat. The harness session is stored on
 *   the run row the moment it is reported, so a restart can resume the run (d-0092). One pump per live run; it
 *   never decides anything, the tick settles the run once the pump says it is done.
 *
 * Exports: startPump(), pumpResult().
 * Depends on: @forge/core (RunEvent, WorkerDriver port), tick/tick-requests, shared/{time,trace}.
 *   Every event and the final result also go to the debug trace sink (d-0163), the one place run events enter the engine.
 */

import type {
  NewRunEvent,
  RunEvent,
  RunHandle,
  RunResult,
  WorkerDriver,
} from '@forge/core';
import { failureResult, familyOf } from '#/domain/results.js';
import { iso } from '#/shared/time.js';
import { emitTrace } from '#/shared/trace.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineState, Pump } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

async function record(deps: EngineDeps, pump: Pump, event: RunEvent): Promise<void> {
  if (event.type === 'ask') {
    pump.asks.set(event.interaction_id, { kind: event.kind, prompt: event.prompt });
  }

  // The full normalised event, as the engine receives it, before storage touches it (d-0163).
  emitTrace(deps, {
    level: 'debug',
    kind: 'run_event',
    run_id: pump.runId,
    actor: 'worker',
    message: `${event.type}${'tool' in event && typeof event.tool === 'string' ? ` ${event.tool}` : ''}`,
    data: event,
  });

  const { seq: _seq, ...rest } = event;
  void _seq;
  try {
    await deps.storage.transaction(async (tx) => {
      await tx.runEvents.append(pump.runId, rest as NewRunEvent);
      // The session is stored as soon as the harness reports it: a restart (or a crash that
      // runs no shutdown) can only resume a run whose session survived in the database.
      await tx.runs.update(pump.runId, {
        last_event_at: iso(deps.clock.now()),
        ...(event.type === 'session' ? { session_ref: event.session_ref } : {}),
      });
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
  driver: WorkerDriver,
  opts: { readonly resumed?: boolean } = {},
): Pump {
  const pump: Pump = {
    runId,
    handle,
    driver,
    resumed: opts.resumed ?? false,
    events: 0,
    done: false,
    asks: new Map(),
    finished: Promise.resolve(),
  };

  pump.finished = (async () => {
    try {
      for await (const event of driver.events(handle)) {
        pump.events++;
        await record(deps, pump, event);
        requestTick(deps, state);
      }

      pump.result = await driver.result(handle);
      emitTrace(deps, {
        level: 'info',
        kind: 'run',
        run_id: runId,
        actor: 'worker',
        message: `run result ${pump.result.status}`,
        data: pump.result,
      });
    } catch (e) {
      pump.error = e;
      emitTrace(deps, {
        level: 'error',
        kind: 'run',
        run_id: runId,
        actor: 'worker',
        message: 'run stream failed',
        data: { error: String(e), family: familyOf(e) },
      });
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
