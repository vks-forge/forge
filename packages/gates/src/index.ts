/**
 * Public API of @forge/gates — re-exports only.
 *
 * Why: the engine composes gates by name and needs one factory per gate, plus the seam
 *   types the server fills in (receipt log, run secret, command runner). Everything else
 *   is internal so check heuristics can change without touching callers.
 *
 * Exports: createG1Gate, detectProjectAt, DetectedProject, createFileReportStore, createStorageToolCallLister, createStorageEarlierRuns, runShellCommand, G1Deps and the command seam types.
 * Depends on: adapters/*, types/g1-deps. No IO on import.
 */

export { runShellCommand } from '#/adapters/command-runner.js';
export { detectProjectAt } from '#/adapters/detect-project-at.js';
export type { DetectedProject } from '#/types/detect-project.types.js';
export { createFileReportStore } from '#/adapters/file-report-store.js';
export { createG1Gate } from '#/adapters/g1-gate-factory.js';
export { createStorageEarlierRuns } from '#/adapters/storage-earlier-runs.js';
export { createStorageToolCallLister } from '#/adapters/storage-tool-calls.js';
export type * from '#/types/g1-deps.types.js';
