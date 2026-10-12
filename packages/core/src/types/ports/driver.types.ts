/**
 * WorkerDriver port — the interface every harness driver implements.
 *
 * Why: Workers run in third-party harnesses (Claude Code, Codex, OpenCode) that each
 *   speak their own protocol. The Director must start, steer, resume, cancel and observe
 *   a run the same way regardless of harness, and must never rely on a harness's own
 *   permission bypass. WorkerDriver is that boundary: one implementation per harness,
 *   normalized events out, policy enforced on our side, and declared capabilities in
 *   place of guesswork. Types only, so core has no runtime dependency on any driver
 *   (execution-plane.md §3, d-0029, d-0035).
 *
 * Exports: Preflight, WorkerDriver.
 * Depends on: schemas/run. No IO (interfaces only).
 */

import type {
  DriverCapabilities,
  RunEvent,
  RunHandle,
  RunRequest,
  RunResult,
  SteerMode,
} from '#/schemas/run.js';

/** Result of a driver self-check before use (binary present, auth available). */
export interface Preflight {
  readonly ok: boolean;
  // Human-readable problems, e.g. "missing binary"; empty when ok.
  readonly issues: readonly string[];
  readonly version?: string;
}

/** The contract every harness driver implements, so the Director starts, steers, resumes and kills a run the same way on any harness. `events()` and `result()` make a serialisable {@link RunHandle} usable after a restart. */
export interface WorkerDriver {
  readonly id: string;
  capabilities(): DriverCapabilities;
  preflight(): Promise<Preflight>;
  start(req: RunRequest): Promise<RunHandle>;
  resume(handle: RunHandle): Promise<RunHandle>;
  steer(handle: RunHandle, message: string, mode: SteerMode): Promise<void>;
  cancel(handle: RunHandle): Promise<void>;
  events(handle: RunHandle): AsyncIterable<RunEvent>;
  result(handle: RunHandle): Promise<RunResult>;
}
