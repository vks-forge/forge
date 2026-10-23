/**
 * Graceful shutdown: interrupt live runs, bound every wait, close the doors.
 *
 * Why: a stopped server must not leave Workers running unobserved or the database open
 *   under a half-finished write, and Ctrl-C must never hang. The tick is asked to stop
 *   first (nothing new is scheduled) but is not awaited yet: a tick in flight may itself be
 *   waiting on a Worker run, so waiting for it before stopping runs would deadlock shutdown.
 *   Before any run is interrupted the server drains: the hook handler refuses new tool calls
 *   (`server_draining`) and shutdown waits, up to `engine.shutdown_drain_ms` and at most half
 *   the grace window, until no live run has a call that was allowed but has no effect receipt.
 *   A stop that lands inside a Write would otherwise leave an edit on disk with nothing signed
 *   to prove it and the resumed run would fail G1; a call still running at the timeout is
 *   interrupted anyway and that case still fails closed.
 *   Live runs are interrupted, not cancelled: each is marked `interrupted` with its harness
 *   session and its harness is stopped, so the next start resumes it instead of crashing it
 *   and the Worker keeps its worktree and conversation (d-0092). Only then does the tick get
 *   a bounded time to finish, and the runs it started in the meantime are interrupted too. Gate jobs
 *   get what is left of the same grace window, because a merge decided on a passed gate
 *   should not be lost to a Ctrl-C, but a hung gate must not hold the process. The Director's
 *   own steps (planning and chat turns, triage, steering replies, the brief of a Worker run) run
 *   as jobs beside the tick: they get the same drain time (`engine.shutdown_drain_ms`, at most
 *   half of what is left) to finish a write, then are abandoned. Nothing is lost by abandoning:
 *   a job's debt is stored (the card reply queue, the ticket's own state), the card claims are
 *   released at the next start, and the step simply runs again (d-0092, d-0134). Last, the
 *   HTTP port, the harness resources and the database close. Every step is best effort and
 *   logged: one failing cancel must not keep the port open.
 *
 * Exports: shutdownServer(), stopOnce().
 * Depends on: @forge/core (WorkerDriver, StorageAdapter, BUILTIN_FORGE_CONFIG), @forge/engine (Engine, Logger),
 *   types/server. IO: stops processes, closes the socket and the database.
 */

import { BUILTIN_FORGE_CONFIG } from '@forge/core';
import type { ShutdownParts } from '#/types/server.types.js';

/** What the drain waits when the setting cannot be read. */
const DEFAULT_DRAIN_MS = BUILTIN_FORGE_CONFIG.engine.shutdown_drain_ms;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** True when `work` finished within `ms`; the timer never outlives the call. */
async function within(ms: number, work: Promise<unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });

  try {
    return await Promise.race([work.then(() => true as const), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs the shutdown sequence; never throws and never waits longer than the grace window plus the close steps. */
export async function shutdownServer(parts: ShutdownParts): Promise<void> {
  const { log, engine } = parts;
  const sleep = parts.sleep ?? defaultSleep;
  const deadline = Date.now() + parts.graceMs;
  const remaining = (): number => Math.max(0, deadline - Date.now());
  const step = async (what: string, fn: () => Promise<void> | void): Promise<void> => {
    try {
      await fn();
    } catch (error) {
      log('warn', `shutdown: ${what} failed`, { error: String(error) });
    }
  };

  const interrupted = new Set<string>();
  const interruptLiveRuns = async (): Promise<void> => {
    const live = engine.liveRunIds().filter((id) => !interrupted.has(id));
    live.forEach((id) => interrupted.add(id));
    if (live.length === 0) {
      return;
    }

    log('info', `shutdown: interrupting ${live.length} live run(s) for a resume`);
    const stops = Promise.all(
      live.map((runId) => step(`interrupt ${runId}`, () => parts.interruptRun(runId))),
    );

    if (!(await within(remaining(), stops))) {
      log('warn', 'shutdown: interrupt did not finish within the grace window');
    }
  };

  // Read once: the drain of tool calls and the wait for Director steps use the same setting.
  let drainTime: Promise<number> | undefined;
  const configuredDrain = (): Promise<number> =>
    (drainTime ??= (parts.drainMs?.() ?? Promise.resolve(DEFAULT_DRAIN_MS)).catch(
      (error: unknown) => {
        log('warn', 'shutdown: could not read the drain time; using the default', {
          error: String(error),
        });

        return DEFAULT_DRAIN_MS;
      },
    ));

  // No new tool call is admitted from here on, and the calls already running get a bounded
  // time to record their effect receipt before their run is interrupted (see the header).
  const drainLiveRuns = async (): Promise<void> => {
    if (!parts.drain) {
      return;
    }

    parts.drain.begin();
    const live = engine.liveRunIds();
    const configured = await configuredDrain();

    // Half the window at most, so the interrupts and the gate jobs keep time of their own.
    const budget = Math.min(configured, Math.floor(remaining() / 2));
    if (live.length === 0 || budget <= 0) {
      return;
    }

    log('info', `shutdown: waiting up to ${budget} ms for in-flight tool calls`, {
      runs: live,
    });

    const stuck = await parts.drain.awaitQuiet(live, budget);
    if (stuck.length > 0) {
      log(
        'warn',
        `shutdown: ${stuck.length} run(s) still had a tool call in flight after ${budget} ms; interrupting anyway`,
        { runs: stuck },
      );
    }
  };

  // Polled sources stop first so no new event is ingested while runs are being interrupted.
  await step('stop trigger polling', () => parts.stopPolling?.());

  // Not awaited yet: see the header on why the tick must not gate the interrupts.
  const tickStopped = step('stop ticker', () => parts.ticker.stop());
  await step('drain live runs', drainLiveRuns);
  await interruptLiveRuns();

  if (!(await within(remaining(), tickStopped))) {
    log('warn', 'shutdown: a tick is still running; closing anyway');
  }

  // A tick that was mid-dispatch may have started runs after the first sweep.
  await interruptLiveRuns();

  // The ticker is stopped, so no tick will apply what these steps decide: wait only so a step that
  // is mid-write can finish, then abandon the rest.
  await step('wait for Director steps', async () => {
    if (engine.directorJobsInFlight() === 0) {
      return;
    }

    const budget = Math.min(await configuredDrain(), Math.floor(remaining() / 2));
    log('info', `shutdown: waiting up to ${budget} ms for Director steps`, {
      jobs: engine.directorJobsInFlight(),
    });

    if (budget <= 0 || !(await within(budget, engine.idle()))) {
      log(
        'warn',
        'shutdown: Director steps still running; abandoning them (their work starts again at the next start)',
      );
    }
  });

  while (engine.gateJobsInFlight() > 0 && Date.now() < deadline) {
    await sleep(100);
  }

  if (engine.gateJobsInFlight() > 0) {
    log(
      'warn',
      `shutdown: ${engine.gateJobsInFlight()} gate job(s) still running; closing anyway`,
    );
  }

  await step('end streams', () => parts.endStreams());
  await step('close http', () => parts.closeHttp());
  await step('dispose ports', () => parts.disposePorts?.());
  await step('close database', () => parts.storage.close());
}

/** A stop function that runs the shutdown once, however often it is called, then `after`; later calls get the same promise. */
export function stopOnce(
  parts: ShutdownParts,
  after: () => Promise<void>,
): () => Promise<void> {
  let stopping: Promise<void> | null = null;

  return () => (stopping ??= shutdownServer(parts).finally(after));
}
