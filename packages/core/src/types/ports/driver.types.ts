/**
 * WorkerDriver port — the interface every harness driver implements.
 *
 * Why: core stays harness-neutral: it speaks only normalized run shapes and drivers
 *   translate at the boundary (code.md rules 2-3, execution-plane.md §3 the Worker
 *   interface, d-0029 ACP-first driver pattern, d-0035 ACP driver contract). Types
 *   only, so core has no runtime dependency on any driver.
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

/** One implementation per harness under packages/drivers (code.md rules 2-3). `events()`/`result()` are additions to the brief so a handle is usable. */
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
