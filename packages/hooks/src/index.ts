/**
 * Public API of @forge/hooks: re-exports only.
 *
 * Why: the Forge server answers every harness hook post through one handler, whatever the
 *   harness. This package is only that harness-neutral receipt ingress (token check,
 *   `admit()`, signed receipt append); the harness-side hook client and settings
 *   renderers live in the driver that owns the harness (d-0056). One surface keeps the
 *   server on the shared wire schemas in `@forge/tools`.
 *
 * Exports: everything from server/ and types/ (hook handler, run credential registry).
 * Depends on: every module under src/. No IO on import.
 */

export * from '#/server/audit-gate.js';
export * from '#/server/hook-handler.js';
export * from '#/server/liveness-recorder.js';
export * from '#/server/run-secrets.js';
export type * from '#/types/hook-handler.types.js';
export type * from '#/types/run-secrets.types.js';
