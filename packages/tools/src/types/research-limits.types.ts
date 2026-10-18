/**
 * Limits of a research request.
 *
 * Why: the owner's host lists narrow what the Director's research may fetch; admission reads them and nothing
 *   here can widen the network floor (d-0144).
 *
 * Exports: ResearchLimits.
 * Depends on: none. Types only.
 */

/** Host lists that narrow what a fetch may reach; nothing here widens the network floor. */
export interface ResearchLimits {
  /** When non-empty, only these exact hosts. */
  readonly allowHosts: readonly string[];
  /** Always refused, subdomains included. */
  readonly denyHosts: readonly string[];
}
