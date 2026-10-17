/**
 * Types for reading one agent's history off a scope's versions.
 *
 * Why: a version of a company or project document says something about an agent in different
 *   places (a stored definition, an override, a disabled list); the history compares what two
 *   neighbouring versions say, so it first reduces each to one comparable standing.
 *
 * Exports: AgentStanding.
 * Depends on: nothing. Types only.
 */

/** What one version's document says about one agent. */
export interface AgentStanding {
  /** The stored definition, diff or override; undefined when the document holds none. */
  readonly stored: unknown;
  /** True when a project document lists the agent as switched off. */
  readonly disabled: boolean;
}
