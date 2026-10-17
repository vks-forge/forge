/**
 * Types for turning an agent definition into a grant layer.
 *
 * Why: the tools package must not import the agent schema (it depends on core types only for
 *   what it already uses), and the grant needs only two fields of an agent. A structural input
 *   lets the engine and the server hand over a definition without a wrapper.
 *
 * Exports: AgentGrantInput.
 * Depends on: nothing. Types only.
 */

/** The two fields of an agent definition that decide its grant layer. */
export interface AgentGrantInput {
  /** `lane_default` follows the lane; otherwise exactly these tool ids. */
  readonly tools: 'lane_default' | readonly string[];
  /** Globs the agent may write; `['**']` is the whole worktree, empty means no writes. */
  readonly write_scope: readonly string[];
}
