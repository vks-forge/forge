/**
 * Public API of @forge/hooks: re-exports only.
 *
 * Why: the driver needs the settings renderers and config schema to wire a run, and the
 *   Forge server needs the handler to answer hook posts. One surface keeps both sides
 *   on the same wire schemas, so the hook script and the server cannot drift apart.
 *
 * Exports: everything from schemas/, client/, domain/, server/ and types/.
 * Depends on: every module under src/. No IO on import.
 */

export * from '#/client/hook-config-file.js';
export * from '#/client/hook-main.js';
export * from '#/domain/decision-outcome.js';
export * from '#/schemas/hook-config.js';
export * from '#/schemas/hook-payload.js';
export * from '#/schemas/hook-wire.js';
export * from '#/server/hook-handler.js';
export * from '#/server/settings-file.js';
export type * from '#/types/hook-client.types.js';
export type * from '#/types/hook-handler.types.js';
export type * from '#/types/settings-file.types.js';
