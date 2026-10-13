/**
 * Minimal in-memory `WorkerDriver`, the reference the contract is validated against.
 *
 * Why: a contract that no implementation has ever failed proves nothing about the
 *   contract itself. This fake does the least a correct driver must: numbered events, one
 *   stable result, cancel, resume and steering for exactly the modes it declares. If the
 *   contract fails here, the contract is wrong, not a harness driver.
 *
 * Exports: createFakeDriver().
 * Depends on: @forge/core (WorkerDriver and schemas), src/shared/event-log. No IO.
 */

import { InvalidInputError } from '@forge/core';
import type {
  RunEvent,
  RunHandle,
  RunRequest,
  RunResult,
  WorkerDriver,
} from '@forge/core';
import { EventLog } from '#/shared/event-log.js';

interface Fake {
  log: EventLog<RunEvent>;
  result: Promise<RunResult>;
  finish(status: RunResult['status']): void;
  session: string;
  seq: number;
}

export function createFakeDriver(): {
  driver: WorkerDriver;
  hangNext(): void;
} {
  const runs = new Map<string, Fake>();
  let hang = false;
  let counter = 0;

  function begin(runId: string): Fake {
    const log = new EventLog<RunEvent>();
    let finish!: (s: RunResult['status']) => void;
    const done = new Promise<RunResult['status']>((r) => (finish = r));
    const fake: Fake = {
      log,
      session: `session-${++counter}`,
      seq: 0,
      finish,
      result: done.then((status) => ({
        status,
        session: fake.session,
        usage: { in: 0, out: 0, cachedIn: 0, cacheWrite: 0 },
        costUsd: null,
        filesTouched: [],
      })),
    };
    runs.set(runId, fake);
    const ts = new Date(0).toISOString();
    log.push({ type: 'text', seq: fake.seq++, ts, text: 'working' });
    if (hang) hang = false;
    else
      queueMicrotask(() => {
        log.close();
        finish('success');
      });
    return fake;
  }

  const get = (h: RunHandle): Fake => {
    const f = runs.get(h.runId);
    if (!f) throw new InvalidInputError(`unknown run ${h.runId}`);
    return f;
  };

  const driver: WorkerDriver = {
    id: 'fake',
    capabilities: () => ({
      resume: true,
      steerModes: ['follow_up'],
      nativeSandbox: false,
      reportsCost: false,
      structuredOutput: false,
      permissionRequests: false,
    }),
    preflight: async () => ({ ok: true, issues: [] }),
    async start(req: RunRequest) {
      const f = begin(req.runId);
      return { runId: req.runId, session: f.session };
    },
    async resume(handle) {
      const prior = get(handle);
      const f = begin(handle.runId);
      f.session = prior.session;
      return { runId: handle.runId, session: f.session };
    },
    async steer(handle, message, mode) {
      const f = get(handle);
      if (mode !== 'follow_up') throw new InvalidInputError(`mode ${mode} not declared`);
      f.log.push({
        type: 'inbox_delivered',
        seq: f.seq++,
        ts: new Date(0).toISOString(),
        inbox_seq: 0,
        mode,
      });
      void message;
    },
    async cancel(handle) {
      const f = get(handle);
      f.log.close();
      f.finish('cancelled');
    },
    events: (handle) => get(handle).log.iterate(),
    result: (handle) => get(handle).result,
  };
  return { driver, hangNext: () => (hang = true) };
}
