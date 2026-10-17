/**
 * Builds the Worker driver, the Director's model and the driver registry from the external ports.
 *
 * Why: the harness and the model arrive as ports so production and the end-to-end tests share
 *   one assembly. A harness that reports problems at start (not logged in, wrong build) must
 *   be visible in the server log from the first line, not discovered when a ticket fails, so
 *   the preflight runs here once and its issues are logged. The registry is where the next
 *   harness is added (d-0087).
 *
 * Exports: composeWorker().
 * Depends on: @forge/core, @forge/engine (Logger), services/driver-registry, services/trace/trace-llm,
 *   types/server. With a trace sink the Director's model is wrapped so every step is logged (d-0163).
 *   IO: the driver's preflight.
 */

import type { DirectorLLM, TraceSink, WorkerDriver } from '@forge/core';
import type { Logger } from '@forge/engine';
import { createDriverRegistry } from '#/services/driver-registry.js';
import { traceDirectorLLM } from '#/services/trace/trace-llm.js';
import type {
  DriverFactoryDeps,
  ExternalPorts,
  LlmWiring,
} from '#/types/server.types.js';

/** The driver, the model port and the registry of installed drivers; logs preflight issues. */
export async function composeWorker(
  ports: ExternalPorts,
  deps: DriverFactoryDeps,
  log: Logger,
  trace?: TraceSink,
): Promise<{
  driver: WorkerDriver;
  llm: DirectorLLM;
  drivers: ReturnType<typeof createDriverRegistry>;
}> {
  const driver = ports.driver(deps);
  // The driver reports prompts and raw output through `onTrace` while it is being built, but the
  // decorator that receives them needs the finished model, so the callback is bound afterwards.
  let report: (t: Parameters<NonNullable<LlmWiring['onTrace']>>[0]) => void = () =>
    undefined;

  const built =
    typeof ports.llm === 'function'
      ? ports.llm({
          harness: deps.harness,
          secrets: deps.secrets,
          ...(trace ? { onTrace: (t) => report(t) } : {}),
        })
      : ports.llm;

  let llm = built;
  if (trace) {
    const traced = traceDirectorLLM(built, {
      trace,
      harness: driver.id,
      now: () => Date.now(),
    });

    report = traced.onTrace;
    llm = traced.llm;
  }

  const preflight = await driver.preflight();
  if (!preflight.ok) {
    log('warn', 'worker driver preflight reported issues', { issues: preflight.issues });
  }

  return { driver, llm, drivers: createDriverRegistry([driver]) };
}
