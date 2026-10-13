/**
 * Default G1 factory — the domain gate wired to the real process spawner.
 *
 * Why: the gate logic is pure over injected seams, but the server wants one call that
 *   gives it a working gate. This is the only place that pairs `buildG1Gate` with the real
 *   shell spawner, so the domain never imports an adapter and tests can build the gate with
 *   a fake runner by passing `runCommand`.
 *
 * Exports: createG1Gate().
 * Depends on: @forge/core (Gate), domain/g1-gate, adapters/command-runner, types/g1-deps.
 */

import type { Gate } from '@forge/core';
import { runShellCommand } from '#/adapters/command-runner.js';
import { buildG1Gate } from '#/domain/g1-gate.js';
import type { G1Deps } from '#/types/g1-deps.types.js';

/** Builds the G1 gate; `deps.runCommand` defaults to the real spawner. */
export function createG1Gate(deps: G1Deps): Gate {
  return buildG1Gate({ ...deps, runCommand: deps.runCommand ?? runShellCommand });
}
