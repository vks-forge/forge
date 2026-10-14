/**
 * Public API of @forge/engine: re-exports only.
 *
 * Why: `apps/server` composes adapters into the Director engine and needs exactly one door
 *   into it, `createEngine`, plus the pure rules the control room and tests reuse (lane
 *   decision, failure policy, invariant check). Everything else in the package is internal
 *   so the tick phases can be reorganised without touching callers (d-0058).
 *
 * Exports: createEngine, createIdSource, createOwnerId, createJsonLogger, requestWake, decideLane, decideFailure, findViolations,
 *   nextTicketNumber, and the engine types.
 * Depends on: tick/engine, tick/wakes, domain/*, types/*. No IO.
 */

export { decideFailure } from '#/domain/failure-policy.js';
export { findViolations } from '#/domain/invariants.js';
export { decideLane } from '#/domain/lane-rules.js';
export { nextTicketNumber } from '#/domain/ticket-numbers.js';
export { createEngine } from '#/tick/engine.js';
export { createIdSource, createOwnerId } from '#/shared/ids.js';
export { createJsonLogger } from '#/shared/json-logger.js';
export { requestWake } from '#/tick/wakes.js';
export type * from '#/types/engine.types.js';
export type * from '#/types/failure-policy.types.js';
export type * from '#/types/invariants.types.js';
export type * from '#/types/lane-rules.types.js';
