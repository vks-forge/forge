/**
 * Types for building the agent roster of a scope.
 *
 * Why: whether an agent's harness can start a run depends on facts the pure roster builder
 *   cannot read (which harnesses are installed, signed in, paused). The caller passes a lookup
 *   that answers for one `runs_on`, so the builder stays pure and the server decides readiness
 *   in one place.
 *
 * Exports: ReadinessLookup.
 * Depends on: schemas/agent, schemas/agent-api. Types only.
 */

import type { RunsOn } from '#/schemas/agent.js';
import type { AgentReadiness } from '#/schemas/agent-api.js';

/** Answers whether the harness named by `runsOn` can start a run now; `project_default` is resolved by the caller. */
export type ReadinessLookup = (runsOn: RunsOn) => AgentReadiness;
