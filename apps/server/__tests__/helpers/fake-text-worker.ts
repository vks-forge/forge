/**
 * A fake Worker harness whose edits are scripted per run, over plain text files.
 *
 * Why: the merge-conflict end-to-end test needs a Worker that writes whatever the scenario says
 *   (a combined file, a file with the markers still in it) in any language, because Forge's conflict
 *   road must not depend on Node tooling (d-0176). Like `createFakeWorker` it goes through the real
 *   hook route, so the real receipts are written and the real G1 gate checks the claims against
 *   them; only the content of the edits comes from a script. Each run asks the script what to write
 *   (the script may read the worktree first, e.g. to see the markers a conflict left), performs one
 *   `Write` per file, and ends with a `finish` that claims every file it wrote.
 *
 * Exports: TextRunInfo, TextScript, createTextWorker().
 * Depends on: @forge/core (WorkerDriver, RunEvent), helpers/channel, helpers/harness-session,
 *   helpers/scripted-writes, helpers/fake-worker-driver (FakeWorker). IO: edits files, HTTP to the server.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunEvent, RunRequest, RunResult, WorkerDriver } from '@forge/core';
import type { DriverFactoryDeps, ForgeServer } from '#/types/server.types.js';
import { createChannel } from '#tests/helpers/channel.js';
import type { FakeWorker } from '#tests/helpers/fake-worker-driver.js';
import { createHarnessSession } from '#tests/helpers/harness-session.js';
import { writeFile } from '#tests/helpers/scripted-writes.js';

/** What a run knows when its script is asked what to write. */
export interface TextRunInfo {
  /** 0 for the first run the Worker was started for, 1 for the next, and so on. */
  readonly index: number;
  readonly cwd: string;
  readonly prompt: string;
  /** The file's text in the run's worktree right now. */
  read(path: string): string;
}

/** The files (path relative to the worktree, new content) one run writes. */
export type TextScript = (
  run: TextRunInfo,
) => Promise<Record<string, string>> | Record<string, string>;

const USAGE = { in: 0, out: 0, cachedIn: 0, cacheWrite: 0 };

/** Builds the driver; `getServer` is read lazily because the driver is made before the server exists. */
export function createTextWorker(
  deps: DriverFactoryDeps,
  getServer: () => ForgeServer,
  script: TextScript,
): FakeWorker {
  const started: string[] = [];
  const requests: RunRequest[] = [];
  const failures: string[] = [];
  const live = new Map<
    string,
    { events: ReturnType<typeof createChannel<RunEvent>>; result: Promise<RunResult> }
  >();

  async function execute(
    req: RunRequest,
    prepared: Awaited<ReturnType<DriverFactoryDeps['prepareRun']>>,
    index: number,
    emit: (e: Record<string, unknown>) => void,
  ): Promise<RunResult> {
    const { hook, tool, mcp } = createHarnessSession(
      req,
      prepared,
      () => getServer().storage,
      emit,
    );

    await hook('SessionStart', {});
    const files = await script({
      index,
      cwd: req.cwd,
      prompt: req.prompt,
      read: (path) => readFileSync(join(req.cwd, path), 'utf8'),
    });

    for (const [path, content] of Object.entries(files)) {
      const full = join(req.cwd, path);
      await tool('Read', { file_path: full }, () => readFileSync(full, 'utf8').length);
      await tool('Write', { file_path: full, content }, writeFile(full, content));
    }

    const finish = {
      summary: `Wrote ${Object.keys(files).join(', ')}.`,
      claims: Object.keys(files).map((path) => ({ kind: 'edited', path })),
    };

    await tool('mcp__forge__finish', finish, () => mcp('finish', finish));

    return {
      status: 'success',
      session: null,
      usage: USAGE,
      costUsd: null,
      filesTouched: [],
    };
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
    preflight: async () => ({ ok: true, issues: [], harnessVersion: '2.1.293' }),
    models: async () => [],
    probe: async () => ({ ok: true, reply: 'ok', durationMs: 1 }),
    async start(req) {
      const prepared = await deps.prepareRun(req);
      const index = started.length;
      started.push(req.runId);
      requests.push(req);

      const events = createChannel<RunEvent>();
      let seq = 0;
      const emit = (e: Record<string, unknown>): void =>
        events.push({ ...e, seq: seq++, ts: new Date().toISOString() } as RunEvent);

      const result = execute(req, prepared, index, emit)
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
      throw new Error('the text worker never resumes');
    },
    async steer() {
      throw new Error('the text worker cannot be steered');
    },
    async cancel() {},
    events: (handle) => known(handle.runId).events.iterate(),
    result: (handle) => known(handle.runId).result,
  };

  return { driver, started, requests, failures };
}
