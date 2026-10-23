/**
 * A fake Worker harness that behaves like Claude Code toward the real server.
 *
 * Why: the end-to-end test must prove that receipts, `finish` claims and the G1 gate work
 *   together without paying for a model. So the fake does everything a harness does to the
 *   server and nothing it does not: it asks the app to prepare the run (run directory,
 *   token, MCP entry, hook URL), then runs a script of tool calls through a harness session
 *   (helpers/harness-session): real hook posts, so the real hook handler writes the signed
 *   receipts; real edits in the worktree only when the hook allows them; the real Forge MCP
 *   server for `finish` and `ask_director`. The behaviour of each run is scripted: a good
 *   run, a run that plants a false claim, a run that asks a question, and a run that can be
 *   interrupted and resumed: it edits one file, reports its session and waits until the server
 *   stops it; started again with `resume` it finishes the job, hooking in again under its new
 *   token like a restored harness session would (d-0092). `resumable_cut_write` is the same
 *   except the interruption lands inside its `Write`: the edit is on disk but the call's
 *   effect receipt is never posted, the way a process killed between the edit and its
 *   PostToolUse hook leaves it. `resumable_slow_write` has a slow `Write`: the edit lands, a
 *   parallel `Read` is attempted part way through, and PostToolUse is posted about a second
 *   after the edit, so a graceful stop has a call in flight to wait for.
 *
 *   A run the script has no line for (e.g. a rework run after a failed gate) ends at once as an
 *   error recorded in `failures`, so a test fails with the reason instead of parking forever.
 *
 * Exports: Behaviour, FakeWorker, createFakeWorker().
 * Depends on: @forge/core (WorkerDriver, RunEvent), helpers/channel, helpers/fake-worker-math, helpers/harness-session,
 *   helpers/scripted-writes. IO: edits files, HTTP to the server.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunEvent, RunRequest, RunResult, WorkerDriver } from '@forge/core';
import type { PreparedRun } from '@forge/drivers';
import type { DriverFactoryDeps, ForgeServer } from '#/types/server.types.js';
import { createChannel } from '#tests/helpers/channel.js';
import { ADD, ADD_TEST, baseHasAdd } from '#tests/helpers/fake-worker-math.js';
import { createHarnessSession } from '#tests/helpers/harness-session.js';
import {
  CutOff,
  cutWrite,
  slowWrite,
  writeFile,
} from '#tests/helpers/scripted-writes.js';

/** What one run does: write good code, plant a claim for a file it never touched, ask a question, or work until stopped and finish when resumed. */
export type Behaviour =
  | 'good'
  | 'false_claim'
  | 'ask'
  | 'resumable'
  | 'resumable_cut_write'
  | 'resumable_slow_write';

export interface FakeWorker {
  readonly driver: WorkerDriver;
  /** Run ids in start order. */
  readonly started: string[];
  /** The requests the driver was started with, in order (a resume repeats the run id and carries `resume`). */
  readonly requests: RunRequest[];
  /** Script errors; empty when every run went to plan. */
  readonly failures: string[];
}

const USAGE = { in: 0, out: 0, cachedIn: 0, cacheWrite: 0 };

const RESUMABLE: readonly Behaviour[] = [
  'resumable',
  'resumable_cut_write',
  'resumable_slow_write',
];

/** Builds the driver; `getServer` is read lazily because the driver is made before the server exists. */
export function createFakeWorker(
  deps: DriverFactoryDeps,
  getServer: () => ForgeServer,
  behaviours: readonly Behaviour[],
): FakeWorker {
  const started: string[] = [];
  const requests: RunRequest[] = [];
  const failures: string[] = [];
  const live = new Map<
    string,
    { events: ReturnType<typeof createChannel<RunEvent>>; result: Promise<RunResult> }
  >();

  /** Resolvers that end a waiting `resumable` run when the server stops it. */
  const stops = new Map<string, () => void>();

  async function execute(
    req: RunRequest,
    prepared: PreparedRun,
    behaviour: Behaviour,
    emit: (e: Record<string, unknown>) => void,
  ): Promise<RunResult> {
    const { hook, tool, mcp } = createHarnessSession(
      req,
      prepared,
      () => getServer().storage,
      emit,
    );

    const resumable = RESUMABLE.includes(behaviour);
    // The scenario is one run, started once and maybe resumed: any other fresh run is a retry.
    if (resumable && req.resume === undefined && started.some((id) => id !== req.runId)) {
      throw new Error(
        `no script for run ${req.runId}: the resumable scenario has one run, this is a retry after a failed gate`,
      );
    }

    const session = `sess-${req.runId}`;
    await hook('SessionStart', {});
    if (resumable) {
      emit({ type: 'session', session_ref: session });
    }

    if (behaviour === 'ask') {
      const question = { question: 'Which module should hold add()?' };
      await tool('mcp__forge__ask_director', question, () =>
        mcp('ask_director', question),
      );

      const pending = await getServer().storage.transaction((tx) =>
        tx.interactions.listPending(),
      );

      return {
        status: 'paused',
        session,
        usage: USAGE,
        costUsd: null,
        filesTouched: [],
        pauseReason: 'interaction',
        interactionId: pending.find((i) => i.run_id === req.runId)?.id ?? 'missing',
      };
    }

    const mathPath = join(req.cwd, 'src', 'math.js');
    // A later ticket of the same project starts from a base that already has `add` (the base is
    // fetched at dispatch): it adds a second function instead of the same one again.
    const fn = baseHasAdd(req.cwd) ? 'addAgain' : 'add';
    const testName = fn === 'add' ? 'adds two numbers' : 'adds again';
    const testPath = join(req.cwd, 'test', 'math.test.js');
    const parked = (): Promise<void> =>
      new Promise<void>((resolve) => stops.set(req.runId, resolve));

    if (!resumable || req.resume === undefined) {
      await tool(
        'Read',
        { file_path: mathPath },
        () => readFileSync(mathPath, 'utf8').length,
      );

      const source = readFileSync(mathPath, 'utf8') + ADD(fn);
      const edit = writeFile(mathPath, source);
      try {
        await tool(
          'Write',
          { file_path: mathPath, content: source },
          behaviour === 'resumable_cut_write'
            ? cutWrite(edit, parked)
            : behaviour === 'resumable_slow_write'
              ? slowWrite(edit, () => tool('Read', { file_path: testPath }, () => 'read'))
              : edit,
        );
      } catch (error) {
        if (!(error instanceof CutOff)) {
          throw error;
        }

        return {
          status: 'cancelled',
          session,
          usage: USAGE,
          costUsd: null,
          filesTouched: [],
        };
      }
    }

    if (resumable && req.resume === undefined) {
      // Half done: wait here until the server stops the run (shutdown interrupts it).
      await parked();

      return {
        status: 'cancelled',
        session,
        usage: USAGE,
        costUsd: null,
        filesTouched: [],
      };
    }

    const spec = readFileSync(testPath, 'utf8')
      .replace('import { subtract }', 'import { add, subtract }')
      .replace(
        'import { add, subtract }',
        `import { ${[...new Set(['add', fn])].join(', ')}, subtract }`,
      )
      .concat(ADD_TEST(fn, testName));

    await tool(
      'Write',
      { file_path: testPath, content: spec },
      writeFile(testPath, spec),
    );

    // The call is receipted like any other; the fake does not run the suite because G1
    // re-runs it independently, which is what the claim is checked against.
    await tool('Bash', { command: 'npm test' }, () => 'tests passed');

    const claims: Record<string, unknown>[] = [
      { kind: 'edited', path: 'src/math.js' },
      { kind: 'edited', path: 'test/math.test.js' },
      { kind: 'added_test', name: testName },
      { kind: 'ran_tests' },
    ];

    if (behaviour === 'false_claim') {
      claims.push({ kind: 'edited', path: 'src/ghost.js' });
    }

    const finish = { summary: 'Added add() and its test.', claims };
    await tool('mcp__forge__finish', finish, () => mcp('finish', finish));

    return { status: 'success', session, usage: USAGE, costUsd: null, filesTouched: [] };
  }

  const known = (runId: string) => {
    const found = live.get(runId);
    if (!found) {
      throw new Error(`unknown run ${runId}`);
    }

    return found;
  };

  const driver: WorkerDriver = {
    id: 'claude-code',
    capabilities: () => ({
      resume: behaviours.some((b) => RESUMABLE.includes(b)),
      steerModes: [],
      nativeSandbox: false,
      reportsCost: false,
      structuredOutput: false,
      permissionRequests: false,
    }),
    // A build the release shipped as verified (the rig's compat port reports the same one).
    preflight: async () => ({ ok: true, issues: [], harnessVersion: '2.1.293' }),
    models: async () => [],
    probe: async () => ({ ok: true, reply: 'ok', durationMs: 1 }),
    async start(req) {
      const prepared = await deps.prepareRun(req);
      const behaviour =
        behaviours[Math.min(started.length, behaviours.length - 1)] ?? 'good';

      started.push(req.runId);
      requests.push(req);

      const events = createChannel<RunEvent>();
      let seq = 0;
      const emit = (e: Record<string, unknown>): void =>
        events.push({ ...e, seq: seq++, ts: new Date().toISOString() } as RunEvent);

      const result = execute(req, prepared, behaviour, emit)
        .catch((error: unknown): RunResult => {
          failures.push(String(error));

          return {
            status: 'error',
            session: null,
            usage: USAGE,
            costUsd: null,
            filesTouched: [],
            errorFamily: 'crash',
          };
        })
        .finally(() => events.close());

      live.set(req.runId, { events, result });

      return { runId: req.runId, session: `sess-${req.runId}` };
    },
    async resume() {
      throw new Error('the fake worker resumes through start({ resume }), not resume()');
    },
    async steer() {
      throw new Error('the fake worker cannot be steered');
    },
    async cancel(handle) {
      // Runs are short scripts and simply finish; only a waiting `resumable` run is stopped.
      stops.get(handle.runId)?.();
    },
    events: (handle) => known(handle.runId).events.iterate(),
    result: (handle) => known(handle.runId).result,
  };

  return { driver, started, requests, failures };
}
