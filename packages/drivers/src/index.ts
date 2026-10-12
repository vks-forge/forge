/**
 * Public API of @forge/drivers: re-exports only (placeholder).
 *
 * Why: Workers run inside third-party harnesses (Claude Code, later others) that each speak their own protocol. The Director must start, steer and kill a run the same way whatever the harness, and must never trust a harness's own permission bypass. This package is that boundary: one driver per harness, normalised events out, policy enforced on our side (execution-plane.md section 4).
 *
 * Exports: none yet.
 * Depends on: nothing. No IO on import.
 */

export {};
