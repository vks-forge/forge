/**
 * Public API of @forge/gates — re-exports only.
 *
 * Why: the engine composes gates by name and needs one factory per gate, plus the seam
 *   types the server fills in (receipt log, run secret, command runner). Everything else
 *   is internal so check heuristics can change without touching callers.
 *
 * Exports: createG1Gate, runShellCommand, G1Deps and the command seam types.
 * Depends on: domain/g1-gate, adapters/command-runner, types/g1-deps. No IO on import.
 */

export { runShellCommand } from '#/adapters/command-runner.js';
export { createG1Gate } from '#/domain/g1-gate.js';
export type * from '#/types/g1-deps.types.js';
