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
 * Depends on: @forge/core, @forge/engine (Logger), services/driver-registry, types/server.
 *   IO: the driver's preflight.
 */

import type { DirectorLLM, WorkerDriver } from '@forge/core';
import type { Logger } from '@forge/engine';
import { createDriverRegistry } from '#/services/driver-registry.js';
import type { DriverFactoryDeps, ExternalPorts } from '#/types/server.types.js';

/** The driver, the model port and the registry of installed drivers; logs preflight issues. */
export async function composeWorker(
  ports: ExternalPorts,
  deps: DriverFactoryDeps,
  log: Logger,
): Promise<{
  driver: WorkerDriver;
  llm: DirectorLLM;
  drivers: ReturnType<typeof createDriverRegistry>;
}> {
  const driver = ports.driver(deps);
  const llm =
    typeof ports.llm === 'function'
      ? ports.llm({ harness: deps.harness, secrets: deps.secrets })
      : ports.llm;

  const preflight = await driver.preflight();
  if (!preflight.ok) {
    log('warn', 'worker driver preflight reported issues', { issues: preflight.issues });
  }

  return { driver, llm, drivers: createDriverRegistry([driver]) };
}
