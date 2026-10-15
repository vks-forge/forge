/**
 * Graceful shutdown: cancel live runs, bound every wait, close the doors.
 *
 * Why: a stopped server must not leave Workers running unobserved or the database open
 *   under a half-finished write, and Ctrl-C must never hang. The tick is asked to stop
 *   first (nothing new is scheduled) but is not awaited yet: a tick in flight may itself be
 *   waiting on a Worker run, so waiting for it before cancelling would deadlock shutdown.
 *   Live runs are cancelled through the driver (a restart kills runs anyway, d-0054; the
 *   next start's reconcile settles them as crashes). Only then does the tick get a bounded
 *   time to finish, and the runs it started in the meantime are cancelled too. Gate jobs
 *   get what is left of the same grace window, because a merge decided on a passed gate
 *   should not be lost to a Ctrl-C, but a hung gate must not hold the process. Last, the
 *   HTTP port, the harness resources and the database close. Every step is best effort and
 *   logged: one failing cancel must not keep the port open.
 *
 * Exports: shutdownServer().
 * Depends on: @forge/core (WorkerDriver, StorageAdapter), @forge/engine (Engine, Logger),
 *   types/server. IO: cancels processes, closes the socket and the database.
 */

import type { ShutdownParts } from '#/types/server.types.js';

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

  const cancelled = new Set<string>();
  const cancelLiveRuns = async (): Promise<void> => {
    const live = engine.liveRunIds().filter((id) => !cancelled.has(id));
    live.forEach((id) => cancelled.add(id));
    if (live.length === 0) {
      return;
    }

    log('info', `shutdown: cancelling ${live.length} live run(s)`);
    const cancels = Promise.all(
      live.map((runId) => step(`cancel ${runId}`, () => parts.cancelRun(runId))),
    );

    if (!(await within(remaining(), cancels))) {
      log('warn', 'shutdown: cancel did not finish within the grace window');
    }
  };

  // Polled sources stop first so no new event is ingested while runs are being cancelled.
  await step('stop trigger polling', () => parts.stopPolling?.());

  // Not awaited yet: see the header on why the tick must not gate the cancels.
  const tickStopped = step('stop ticker', () => parts.ticker.stop());
  await cancelLiveRuns();

  if (!(await within(remaining(), tickStopped))) {
    log('warn', 'shutdown: a tick is still running; closing anyway');
  }

  // A tick that was mid-dispatch may have started runs after the first sweep.
  await cancelLiveRuns();

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
