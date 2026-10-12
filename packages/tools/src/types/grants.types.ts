/**
 * Types for lane defaults and the effective (merged) grant of a run.
 *
 * Why: a run's tool policy is the narrowing intersection of lane defaults, the project
 *   grant and the ticket grant, with operator-managed deny rules on top. Giving the
 *   merged result one explicit shape means `admit()` evaluates a single object that
 *   already carries provenance, and tests can assert the "never widens" invariant on it
 *   directly (tool-system.md §5.1, §12).
 *
 * Exports: LaneDefaults, RuleLayer, EffectiveGrant, GrantVerdict.
 * Depends on: @forge/core (Lane), schemas/grant. No IO.
 */

import type { Lane } from '@forge/core';
import type { CallRule } from '#/schemas/grant.js';

/** The ceiling of what a lane may ever offer, before project and ticket narrowing. */
export interface LaneDefaults {
  /** Tool-id globs visible in this lane. */
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  /** Exact tool ids a project grant may add (`per project grant` rows of §12). */
  readonly projectGated: readonly string[];
  /** Whether project grants may add project MCP servers (`mcp__<server>__*`, not `forge`). */
  readonly projectMcps: boolean;
  readonly rules: readonly CallRule[];
}

/** An ordered rule list from one layer, named for provenance (`lane:standard`, `project`). */
export interface RuleLayer {
  readonly name: string;
  readonly rules: readonly CallRule[];
}

/** Merged policy for one run. Built only by `effectiveGrant()`. */
export interface EffectiveGrant {
  readonly lane: Lane;
  /** Lane allow globs plus any project-gated tool the project grant named. */
  readonly ceiling: readonly string[];
  /** Tool-id globs a project grant named, honoured only for project MCPs when the lane allows them. */
  readonly projectMcpAllow: readonly string[];
  readonly projectMcps: boolean;
  /** One entry per layer that restricted `allow` (project, ticket); a tool must match every one. */
  readonly narrowing: readonly (readonly string[])[];
  readonly deny: readonly string[];
  readonly ruleLayers: readonly RuleLayer[];
  /** Operator deny-only rules (floors plus managed), applied last and never overridable. */
  readonly managed: readonly CallRule[];
}

/** Capability-gate answer for one tool id. */
export interface GrantVerdict {
  readonly granted: boolean;
  /** `grant:deny:<glob>` or `grant:ceiling` / `grant:narrow:<n>` for the layer that refused; `null` if granted. */
  readonly rule: string | null;
}
