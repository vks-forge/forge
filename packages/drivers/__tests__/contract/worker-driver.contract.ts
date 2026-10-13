/**
 * Contract every `WorkerDriver` must pass: `describeWorkerDriverContract(name, make)`.
 *
 * Why: the Director starts, steers, resumes and cancels runs through the port alone and
 *   must not care which harness is behind it. This contract is the behaviour it relies on:
 *   capabilities are declared and stable, preflight has a fixed shape, a run streams
 *   numbered events and ends in one parseable result, cancel ends a hung run as
 *   `cancelled`, a finished session can be resumed, and steering works exactly for the
 *   modes the driver declared. A new harness driver passes this before it gets any test of
 *   its own (code.md rule 8); the Claude engines run it on fakes.
 *
 * Exports: ContractHarness, describeWorkerDriverContract().
 * Depends on: vitest, @forge/core (schemas and WorkerDriver). No IO of its own.
 */

import { DriverCapabilities, RunEvent, RunResult, SteerMode } from '@forge/core';
import type { RunRequest, WorkerDriver } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

export interface ContractHarness {
  readonly driver: WorkerDriver;
  request(over?: Partial<RunRequest>): RunRequest;
  /** The next started run finishes successfully. */
  scriptSuccess(): void;
  /** The next started run blocks until it is cancelled. */
  scriptHang(): void;
  close(): Promise<void>;
}

async function drain(driver: WorkerDriver, runId: string): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const e of driver.events({ runId })) {
    out.push(RunEvent.parse(e));
  }

  return out;
}

export function describeWorkerDriverContract(
  name: string,
  make: () => Promise<ContractHarness>,
): void {
  // 30s per case: the CLI engine runs real node child processes, slow under a loaded suite.
  describe(`WorkerDriver contract: ${name}`, { timeout: 30_000 }, () => {
    let h: ContractHarness;
    beforeEach(async () => {
      h = await make();
    });

    afterEach(async () => {
      await h.close();
    });

    it('declares stable, schema-valid capabilities and a non-empty id', () => {
      const first = h.driver.capabilities();
      expect(h.driver.id.length).toBeGreaterThan(0);
      expect(DriverCapabilities.parse(first)).toEqual(first);
      expect(h.driver.capabilities()).toEqual(first);
      for (const mode of first.steerModes) {
        expect(SteerMode.options).toContain(mode);
      }
    });

    it('preflight returns ok with no issues, or not ok with at least one', async () => {
      const p = await h.driver.preflight();
      expect(typeof p.ok).toBe('boolean');
      expect(Array.isArray(p.issues)).toBe(true);
      expect(p.ok).toBe(p.issues.length === 0);
    });

    it('start streams numbered events and ends in one stable, valid result', async () => {
      h.scriptSuccess();
      const req = h.request();
      const handle = await h.driver.start(req);
      expect(handle.runId).toBe(req.runId);
      const events = await drain(h.driver, handle.runId);
      expect(events.length).toBeGreaterThan(0);
      events.forEach((e, i) => {
        expect(e.seq).toBe(i);
      });

      const result = await h.driver.result(handle);
      expect(RunResult.parse(result)).toEqual(result);
      expect(result.status).toBe('success');
      expect(await h.driver.result(handle)).toEqual(result);
      expect(Array.isArray(result.filesTouched)).toBe(true);
    });

    it('replays all events to a late second consumer', async () => {
      h.scriptSuccess();
      const handle = await h.driver.start(h.request());
      await h.driver.result(handle);
      const a = await drain(h.driver, handle.runId);
      const b = await drain(h.driver, handle.runId);
      expect(b).toEqual(a);
    });

    it('cancel ends a hung run as cancelled and closes the event stream', async () => {
      h.scriptHang();
      const handle = await h.driver.start(h.request());
      const events = drain(h.driver, handle.runId);
      await h.driver.cancel(handle);
      expect((await h.driver.result(handle)).status).toBe('cancelled');
      await expect(events).resolves.toBeDefined();
      await h.driver.cancel(handle);
    });

    it('resumes a finished session via start(req.resume) when resume is declared', async () => {
      if (!h.driver.capabilities().resume) {
        return;
      }

      h.scriptSuccess();
      const first = await h.driver.start(h.request());
      const done = await h.driver.result(first);
      expect(done.session).not.toBeNull();
      h.scriptSuccess();
      const second = await h.driver.start(
        h.request({ runId: 'run-2', resume: done.session ?? '' }),
      );

      expect((await h.driver.result(second)).status).toBe('success');
    });

    it('resume(handle) continues a finished run on its session', async () => {
      if (!h.driver.capabilities().resume) {
        return;
      }

      h.scriptSuccess();
      const handle = await h.driver.start(h.request());
      const done = await h.driver.result(handle);
      h.scriptSuccess();
      const resumed = await h.driver.resume({
        runId: handle.runId,
        ...(done.session ? { session: done.session } : {}),
      });

      expect(resumed.runId).toBe(handle.runId);
      expect((await h.driver.result(resumed)).status).toBe('success');
    });

    it('steers exactly the declared modes and rejects the rest', async () => {
      const declared = new Set(h.driver.capabilities().steerModes);
      for (const mode of SteerMode.options) {
        h.scriptHang();
        const handle = await h.driver.start(h.request({ runId: `run-${mode}` }));
        const attempt = h.driver.steer(handle, `please ${mode}`, mode);
        if (declared.has(mode)) {
          await expect(attempt).resolves.toBeUndefined();
        } else {
          await expect(attempt).rejects.toThrow();
        }

        await h.driver.cancel(handle);
        const status = (await h.driver.result(handle)).status;
        expect(['cancelled', 'success']).toContain(status);
      }
    });

    it('rejects unknown handles instead of returning an empty answer', async () => {
      const ghost = { runId: 'no-such-run' };
      // Wrapped so a synchronous throw and a rejected promise both count as a rejection.
      await expect((async () => h.driver.result(ghost))()).rejects.toThrow();
      await expect((async () => h.driver.cancel(ghost))()).rejects.toThrow();
    });
  });
}
