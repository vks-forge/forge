/**
 * Graceful shutdown: interrupt live runs, bound every wait, close the doors.
 *
 * Why: a stopped server must not leave Workers running unobserved or the database open
 *   under a half-finished write, and Ctrl-C must never hang. The tick is asked to stop
 *   first (nothing new is scheduled) but is not awaited yet: a tick in flight may itself be
 *   waiting on a Worker run, so waiting for it before stopping runs would deadlock shutdown.
 *   Live runs are interrupted, not cancelled: each is marked `interrupted` with its harness
 *   session and its harness is stopped, so the next start resumes it instead of crashing it
 *   and the Worker keeps its worktree and conversation (d-0092). Only then does the tick get
 *   a bounded time to finish, and the runs it started in the meantime are interrupted too. Gate jobs
 *   get what is left of the same grace window, because a merge decided on a passed gate
 *   should not be lost to a Ctrl-C, but a hung gate must not hold the process. Last, the
 *   HTTP port, the harness resources and the database close. Every step is best effort and
 *   logged: one failing cancel must not keep the port open.
 *
 * Exports: shutdownServer().
 * Depends on: @forge/core (WorkerDriver, StorageAdapter), @forge/engine (Engine, Logger),
 *   types/server. IO: stops processes, closes the socket and the database.
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

  // Polled sources stop first so no new event is ingested while runs are being interrupted.
  await step('stop trigger polling', () => parts.stopPolling?.());

  // Not awaited yet: see the header on why the tick must not gate the interrupts.
  const tickStopped = step('stop ticker', () => parts.ticker.stop());
  await interruptLiveRuns();

  if (!(await within(remaining(), tickStopped))) {
    log('warn', 'shutdown: a tick is still running; closing anyway');
  }

  // A tick that was mid-dispatch may have started runs after the first sweep.
  await interruptLiveRuns();

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
