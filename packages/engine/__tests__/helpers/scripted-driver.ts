/**
 * Scripted WorkerDriver for engine scenario tests.
 *
 * Why: engine scenarios are about what the Director does when a run emits events, pauses,
 *   stalls or fails, not about any harness. This fake lets a test start a run, push the
 *   exact events it wants, and finish it with the exact `RunResult` (an error family, a
 *   pause, a rate limit with a reset time), then watch the engine react. It records every
 *   start request, steer and cancel so scenarios can assert on what the engine asked for.
 *
 * Exports: ScriptedDriver, createScriptedDriver(), makeResult().
 * Depends on: @forge/core (WorkerDriver, RunEvent, RunResult). No IO.
 */

import type {
  RunEvent,
  RunHandle,
  RunRequest,
  RunResult,
  SteerMode,
  WorkerDriver,
} from '@forge/core';

interface Channel {
  readonly req: RunRequest;
  readonly queue: RunEvent[];
  closed: boolean;
  wake: (() => void) | null;
  result: Promise<RunResult>;
  settle: (r: RunResult) => void;
}

export interface ScriptedDriver {
  readonly driver: WorkerDriver;
  readonly starts: RunRequest[];
  readonly steers: {
    runId: string;
    message: string;
    mode: SteerMode;
    inboxSeq?: number;
  }[];
  readonly cancels: string[];
  /** Pushes an event into a started run's stream. */
  emit(
    runId: string,
    event: Omit<RunEvent, 'seq' | 'ts'> & Record<string, unknown>,
  ): void;
  /** Ends the stream and resolves `result()`. */
  finish(runId: string, result: RunResult): void;
  /** Makes the next `start()` throw. */
  failNextStart(error: Error): void;
  /** Makes `steer` throw. */
  failSteer(error: Error | null): void;
  /** Declares a different set of steer modes (default all three). */
  setSteerModes(modes: SteerMode[]): void;
  /** Declares whether `resume` is supported (default true). */
  setCanResume(value: boolean): void;
}

/** A valid `RunResult`; override only what the scenario cares about. */
export function makeResult(over: Partial<RunResult> = {}): RunResult {
  return {
    status: 'success',
    session: 'sess-1',
    usage: { in: 10, out: 5, cachedIn: 0, cacheWrite: 0 },
    costUsd: 0.01,
    filesTouched: [],
    ...over,
  } as RunResult;
}

export function createScriptedDriver(): ScriptedDriver {
  const channels = new Map<string, Channel>();
  const starts: RunRequest[] = [];
  const steers: ScriptedDriver['steers'] = [];
  const cancels: string[] = [];
  let startError: Error | null = null;
  let steerError: Error | null = null;
  let modes: SteerMode[] = ['steer', 'follow_up', 'interrupt'];
  let canResume = true;
  let seq = 0;

  const chan = (h: RunHandle): Channel => {
    const c = channels.get(h.runId);
    if (!c) throw new Error(`unknown run ${h.runId}`);
    return c;
  };
  const closeChannel = (c: Channel): void => {
    c.closed = true;
    c.wake?.();
  };

  const driver: WorkerDriver = {
    id: 'scripted',
    capabilities: () => ({
      resume: canResume,
      steerModes: modes,
      nativeSandbox: false,
      reportsCost: true,
      structuredOutput: false,
      permissionRequests: false,
    }),
    preflight: async () => ({ ok: true, issues: [] }),
    async start(req) {
      if (startError) {
        const e = startError;
        startError = null;
        throw e;
      }
      starts.push(req);
      let settle!: (r: RunResult) => void;
      const result = new Promise<RunResult>((r) => (settle = r));
      channels.set(req.runId, {
        req,
        queue: [],
        closed: false,
        wake: null,
        result,
        settle,
      });
      return { runId: req.runId, session: `sess-${req.runId}` };
    },
    resume: async (h) => h,
    async steer(handle, message, mode, inboxSeq) {
      if (steerError) throw steerError;
      steers.push({
        runId: handle.runId,
        message,
        mode,
        ...(inboxSeq === undefined ? {} : { inboxSeq }),
      });
    },
    async cancel(handle) {
      cancels.push(handle.runId);
      const c = chan(handle);
      closeChannel(c);
      c.settle(
        makeResult({ status: 'cancelled', session: null, errorFamily: undefined }),
      );
    },
    events(handle) {
      const c = chan(handle);
      return {
        async *[Symbol.asyncIterator]() {
          for (;;) {
            const next = c.queue.shift();
            if (next) {
              yield next;
              continue;
            }
            if (c.closed) return;
            await new Promise<void>((resolve) => (c.wake = resolve));
            c.wake = null;
          }
        },
      };
    },
    result: (handle) => chan(handle).result,
  };

  return {
    driver,
    starts,
    steers,
    cancels,
    emit(runId, event) {
      const c = channels.get(runId);
      if (!c) throw new Error(`unknown run ${runId}`);
      c.queue.push({ seq: seq++, ts: new Date(0).toISOString(), ...event } as RunEvent);
      c.wake?.();
    },
    finish(runId, result) {
      const c = channels.get(runId);
      if (!c) throw new Error(`unknown run ${runId}`);
      closeChannel(c);
      c.settle(result);
    },
    failNextStart: (e) => (startError = e),
    failSteer: (e) => (steerError = e),
    setSteerModes: (m) => (modes = m),
    setCanResume: (v) => (canResume = v),
  };
}
