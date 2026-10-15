/**
 * Runs the "stop the server mid-run, start another on the same data home" scenario.
 *
 * Why: the resume tests (a clean resume that must merge, a cut-off write that must fail G1)
 *   differ only in where the first server is stopped and what the second one is expected to
 *   do. The interruption point decides the outcome (a call cut off before its effect receipt
 *   leaves the claim unsupported), so it is chosen here, by the event the test names, and never
 *   by luck: the stop waits for the stated number of `tool_call` or `tool_result` run events.
 *
 * Exports: InterruptPoint, Stopped, interruptAndRestart().
 * Depends on: helpers/e2e-rig, helpers/wait-for, @forge/db. IO: SQLite, git, loopback sockets.
 */

import { openSqlite } from '@forge/db';
import { intakeBody, startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import type { Behaviour } from '#tests/helpers/fake-worker-driver.js';
import { waitFor } from '#tests/helpers/wait-for.js';

/** Stop once the first run has stored `count` run events of `type`. */
export interface InterruptPoint {
  readonly type: 'tool_call' | 'tool_result';
  readonly count: number;
}

/** What the database says right after the first server has stopped. */
export interface Stopped {
  run: { status: string; generation?: number; resumable_session?: string };
  ticket: string;
  secrets: string[];
}

/** Starts a server, lets the first run reach `at`, stops the server gracefully, starts a second one. */
export async function interruptAndRestart(
  behaviours: readonly Behaviour[],
  at: InterruptPoint,
  options: { readonly drainMs?: number } = {},
): Promise<{
  first: E2eRig;
  second: E2eRig;
  runId: string;
  stopped: Stopped;
  /** How long the first server took to stop, drain included. */
  stopMs: number;
}> {
  const first = await startE2eRig(behaviours, options);
  const intake = await first.call('POST', '/intake', intakeBody('resume-1'));
  if (intake.status !== 202) {
    throw new Error(`intake refused: ${intake.status}`);
  }

  const runId = await waitFor('the first run to start', () => first.worker.started[0]);
  await waitFor(`${at.count} ${at.type} event(s)`, async () => {
    const events = await first.server.storage.transaction((tx) =>
      tx.runEvents.listByRun(runId),
    );

    return events.filter((e) => e.type === at.type).length >= at.count;
  });

  // The first server stops gracefully, the way `forge stop` does.
  const stopBegan = Date.now();
  await first.server.stop();
  const stopMs = Date.now() - stopBegan;
  const db = openSqlite(first.settings.layout.data.dbPath);
  let stopped: Stopped;
  try {
    const [run, ticket] = await db.storage.transaction(async (tx) => [
      await tx.runs.get(runId),
      await tx.tickets.get('FX-1' as never),
    ]);

    stopped = {
      run: {
        status: run?.status ?? 'missing',
        ...(run?.generation === undefined ? {} : { generation: run.generation }),
        ...(run?.resumable_session === undefined
          ? {}
          : { resumable_session: run.resumable_session }),
      },
      ticket: ticket?.status ?? 'missing',
      secrets: await first.secrets.list('run/'),
    };
  } finally {
    await db.storage.close();
  }

  // A second server on the same data home and the same secret store.
  const second = await startE2eRig(behaviours, {
    fixture: first.fixture,
    secrets: first.secrets,
  });

  return { first, second, runId, stopped, stopMs };
}
