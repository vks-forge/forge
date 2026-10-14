/**
 * Public API of @forge/core — re-exports only.
 *
 * Why: adapters (db, drivers, tools, gates) and apps depend on core's domain rules,
 *   schemas and ports, and on nothing else in it. A single entry point means consumers
 *   cannot reach into internals, so core can be reorganised freely, and the dependency
 *   direction (core imports no sibling, adapters import only core) stays
 *   machine-checkable instead of resting on reviewer vigilance. Everything
 *   harness-neutral that the rest of the factory shares is exported from here (d-0040).
 *
 * Exports: everything exported by domain/, schemas/, shared/ and types/.
 * Depends on: every module under src/. No IO.
 */

export * from '#/domain/branch.js';
export * from '#/domain/data-home.js';
export * from '#/domain/builtin-config.js';
export * from '#/domain/harness-secret.js';
export * from '#/domain/ids.js';
export * from '#/domain/merge-config.js';
export * from '#/domain/lane-triage.js';
export * from '#/domain/run-active.js';
export * from '#/domain/secret-name.js';
export * from '#/domain/state-machine.js';
export * from '#/domain/ticket-patch.js';
export * from '#/schemas/bootstrap-home.js';
export * from '#/schemas/claims.js';
export * from '#/schemas/config-override.js';
export * from '#/schemas/errors.js';
export * from '#/schemas/forge-config.js';
export * from '#/schemas/gate-result.js';
export * from '#/schemas/harness.js';
export * from '#/schemas/github-connection.js';
export * from '#/schemas/ids.js';
export * from '#/schemas/intake.js';
export * from '#/schemas/interaction.js';
export * from '#/schemas/project.js';
export * from '#/schemas/run-inbox.js';
export * from '#/schemas/run.js';
export * from '#/schemas/secret-name.js';
export * from '#/schemas/steps.js';
export * from '#/schemas/ticket-relation.js';
export * from '#/schemas/ticket.js';
export * from '#/schemas/wake-request.js';
export * from '#/shared/deep-partial.js';
export * from '#/shared/errors.js';
export * from '#/shared/glob.js';
export * from '#/shared/result.js';
export type * from '#/types/branch.types.js';
export type * from '#/types/data-home.types.js';
export type * from '#/types/config.types.js';
export type * from '#/types/errors.types.js';
export type * from '#/types/ids.types.js';
export type * from '#/types/lane-triage.types.js';
export type * from '#/types/ports/clock.types.js';
export type * from '#/types/ports/config-source.types.js';
export type * from '#/types/ports/director-llm.types.js';
export type * from '#/types/ports/driver.types.js';
export type * from '#/types/ports/gate.types.js';
export type * from '#/types/ports/git-host.types.js';
export type * from '#/types/ports/memory-source.types.js';
export type * from '#/types/ports/report-store.types.js';
export type * from '#/types/ports/secret-store.types.js';
export type * from '#/types/ports/storage.types.js';
export type * from '#/types/ports/worktree.types.js';
export type * from '#/types/result.types.js';
export type * from '#/types/run-event.types.js';
export type * from '#/types/ticket-events.types.js';
