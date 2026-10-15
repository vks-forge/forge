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
 *   run, a run that plants a false claim, a run that asks a question.
 *
 * Exports: Behaviour, FakeWorker, createFakeWorker().
 * Depends on: @forge/core (WorkerDriver, RunEvent), helpers/channel, helpers/harness-session.
 *   IO: edits files, HTTP to the server.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { RunEvent, RunRequest, RunResult, WorkerDriver } from '@forge/core';
import type { PreparedRun } from '@forge/drivers';
import type { DriverFactoryDeps, ForgeServer } from '#/types/server.types.js';
import { createChannel } from '#tests/helpers/channel.js';
import { createHarnessSession } from '#tests/helpers/harness-session.js';

/** What one run does: write good code, plant a claim for a file it never touched, or ask a question. */
export type Behaviour = 'good' | 'false_claim' | 'ask';

export interface FakeWorker {
  readonly driver: WorkerDriver;
  /** Run ids in start order. */
  readonly started: string[];
  /** Script errors; empty when every run went to plan. */
  readonly failures: string[];
}

const ADD = `
export function add(a, b) {
  return a + b;
}
`;

const ADD_TEST = `
test('adds two numbers', () => {
  assert.equal(add(1, 2), 3);
});
`;

const USAGE = { in: 0, out: 0, cachedIn: 0, cacheWrite: 0 };

const writeFile = (path: string, content: string) => (): string => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);

  return `wrote ${path}`;
};

/** Builds the driver; `getServer` is read lazily because the driver is made before the server exists. */
export function createFakeWorker(
  deps: DriverFactoryDeps,
  getServer: () => ForgeServer,
  behaviours: readonly Behaviour[],
): FakeWorker {
  const started: string[] = [];
  const failures: string[] = [];
  const live = new Map<
    string,
    { events: ReturnType<typeof createChannel<RunEvent>>; result: Promise<RunResult> }
  >();

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

    const session = `sess-${req.runId}`;
    await hook('SessionStart', {});

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
    const testPath = join(req.cwd, 'test', 'math.test.js');
    await tool(
      'Read',
      { file_path: mathPath },
      () => readFileSync(mathPath, 'utf8').length,
    );

    const source = readFileSync(mathPath, 'utf8') + ADD;
    await tool(
      'Write',
      { file_path: mathPath, content: source },
      writeFile(mathPath, source),
    );

    const spec = readFileSync(testPath, 'utf8')
      .replace('import { subtract }', 'import { add, subtract }')
      .concat(ADD_TEST);

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
      { kind: 'added_test', name: 'adds two numbers' },
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
      resume: false,
      steerModes: [],
      nativeSandbox: false,
      reportsCost: false,
      structuredOutput: false,
      permissionRequests: false,
    }),
    // A build the release shipped as verified (the rig's compat port reports the same one).
    preflight: async () => ({ ok: true, issues: [], harnessVersion: '2.1.293' }),
    async start(req) {
      const prepared = await deps.prepareRun(req);
      const behaviour =
        behaviours[Math.min(started.length, behaviours.length - 1)] ?? 'good';

      started.push(req.runId);

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
      throw new Error('the fake worker does not resume');
    },
    async steer() {
      throw new Error('the fake worker cannot be steered');
    },
    async cancel() {
      // Runs are short scripts; shutdown simply lets them finish.
    },
    events: (handle) => known(handle.runId).events.iterate(),
    result: (handle) => known(handle.runId).result,
  };

  return { driver, started, failures };
}
