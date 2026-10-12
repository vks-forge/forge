/**
 * Public API of @forge/core — re-exports only.
 *
 * Why: the package boundary is one file so adapters import `@forge/core` and nothing
 *   deeper, and the layering rule can be enforced mechanically (code.md rules 1 and 10,
 *   d-0040).
 *
 * Exports: everything exported by domain/, schemas/, shared/ and types/.
 * Depends on: every module under src/. No IO.
 */

export * from '#/domain/branch.js';
export * from '#/domain/ids.js';
export * from '#/domain/lane-triage.js';
export * from '#/domain/state-machine.js';
export * from '#/schemas/errors.js';
export * from '#/schemas/ids.js';
export * from '#/schemas/intake.js';
export * from '#/schemas/interaction.js';
export * from '#/schemas/project.js';
export * from '#/schemas/run.js';
export * from '#/schemas/ticket.js';
export * from '#/shared/errors.js';
export * from '#/shared/glob.js';
export * from '#/shared/result.js';
export type * from '#/types/branch.types.js';
export type * from '#/types/errors.types.js';
export type * from '#/types/ids.types.js';
export type * from '#/types/lane-triage.types.js';
export type * from '#/types/ports/driver.types.js';
export type * from '#/types/ports/storage.types.js';
export type * from '#/types/result.types.js';
export type * from '#/types/ticket-events.types.js';
