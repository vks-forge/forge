/**
 * Public API of @forge/drivers: re-exports only.
 *
 * Why: Workers run inside third-party harnesses (Claude Code, later others) that each speak
 *   their own protocol. The Director must start, steer and kill a run the same way whatever
 *   the harness, and must never trust a harness's own permission bypass. This package is
 *   that boundary: one driver per harness, normalised events out, policy decided on
 *   Forge's side (execution-plane.md section 4). The app composes a driver from this
 *   surface and the ports it owns (run preparation, receipts, clock, spawn).
 *
 * Exports: createClaudeDriver, createClaudeDirectorLLM, createHarnessResolver, testClaudeHarness,
 *   systemClock, nodeSpawn, createReceiptLookup, resolveClaudeBinary, resolveInstalledClaude,
 *   HarnessNotInstalledError, parseClaudeConfig, ClaudeDriverConfig, the pinned adapter version
 *   and the driver dependency types.
 * Depends on: adapters/claude, schemas, types. No IO on import.
 */

export * from '#/adapters/claude/claude-driver.js';
export * from '#/adapters/claude/director-llm.js';
export * from '#/adapters/claude/harness-resolver.js';
export * from '#/adapters/claude/harness-test.js';
export * from '#/adapters/claude/receipt-lookup.js';
export * from '#/adapters/claude/system.js';
export { resolveClaudeBinary, resolveInstalledClaude } from '#/domain/claude-binary.js';
export { authVerdict } from '#/domain/harness-auth.js';
export { HarnessNotInstalledError, INSTALL_CLAUDE_HINT } from '#/shared/errors.js';
export * from '#/schemas/claude-config.js';
export type * from '#/types/claude/claude-binary.types.js';
export type * from '#/types/claude/director-llm.types.js';
export type * from '#/types/claude/driver-deps.types.js';
export type * from '#/types/claude/engine.types.js';
export type * from '#/types/claude/harness.types.js';
